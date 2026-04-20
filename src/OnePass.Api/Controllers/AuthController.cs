using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authentication.MicrosoftAccount;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using OnePass.Api.Auth;
using OnePass.Api.Dtos;
using OnePass.Api.Models;
using OnePass.Api.Services;

namespace OnePass.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IUserService _users;
    private readonly IJwtTokenService _jwt;
    private readonly JwtOptions _opts;
    private readonly GoogleAuthOptions _googleOptions;
    private readonly MicrosoftAuthOptions _microsoftOptions;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IUserService users,
        IJwtTokenService jwt,
        JwtOptions opts,
        GoogleAuthOptions googleOptions,
        MicrosoftAuthOptions microsoftOptions,
        ILogger<AuthController> logger)
    {
        _users = users;
        _jwt = jwt;
        _opts = opts;
        _googleOptions = googleOptions;
        _microsoftOptions = microsoftOptions;
        _logger = logger;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(FairUseRateLimiter.AnonymousPolicyName)]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.EmailOrUsername) || string.IsNullOrWhiteSpace(req.Password))
            return Unauthorized();
        var user = await _users.FindByEmailOrUsernameAsync(req.EmailOrUsername, ct);
        if (user is null || !user.IsActive || !_users.VerifyPassword(user, req.Password))
            return Unauthorized();
        var token = _jwt.CreateToken(user);
        return new LoginResponse(token, user.RowKey, user.Username, user.Role, _opts.ExpirationMinutes);
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting(FairUseRateLimiter.AnonymousPolicyName)]
    public async Task<ActionResult<LoginResponse>> Register([FromBody] CreateUserRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "Email and password are required." });
        try
        {
            // Self-registration always lands as a regular User; req.Role is
            // ignored even if the SPA happens to send one, so a malicious
            // caller cannot promote themselves to Admin by hand-crafting the
            // request body.
            var user = await _users.CreateAsync(req.Email, req.Username, req.Password, Roles.User, ct);
            var token = _jwt.CreateToken(user);
            return new LoginResponse(token, user.RowKey, user.Username, user.Role, _opts.ExpirationMinutes);
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    /// <summary>
    /// Lightweight availability check used by the registration form to
    /// give immediate feedback as the user types. Rate-limited via the
    /// anonymous policy to mitigate account-enumeration scraping
    /// (OWASP A07): a determined attacker can still guess one username at
    /// a time, but the same protection applies to the eventual register
    /// call which already returns 409 on conflict.
    /// </summary>
    [HttpGet("check-username")]
    [AllowAnonymous]
    [EnableRateLimiting(FairUseRateLimiter.AnonymousPolicyName)]
    public async Task<IActionResult> CheckUsername([FromQuery] string? username, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Trim().Length < 3)
            return Ok(new { available = false, reason = "too_short" });
        var existing = await _users.FindByEmailOrUsernameAsync(username.Trim(), ct);
        return Ok(new { available = existing is null });
    }

    /// <summary>
    /// Lightweight discovery endpoint so the SPA knows which external IdPs
    /// are wired in this environment. Returning <c>{ google: false }</c>
    /// when the OAuth client is not configured keeps the "Continue with
    /// Google" button hidden in dev environments that haven't yet pasted
    /// in their client id/secret.
    /// </summary>
    [HttpGet("providers")]
    [AllowAnonymous]
    public IActionResult Providers() => Ok(new
    {
        google = _googleOptions.IsConfigured,
        microsoft = _microsoftOptions.IsConfigured,
    });

    /// <summary>
    /// Start the Google OAuth dance. The browser is bounced to Google's
    /// consent screen; on success Google posts back to the
    /// <see cref="GoogleCallback(string?, CancellationToken)"/> endpoint
    /// below.
    /// </summary>
    [HttpGet("google")]
    [AllowAnonymous]
    [EnableRateLimiting(FairUseRateLimiter.AnonymousPolicyName)]
    public IActionResult GoogleSignIn([FromQuery] string? returnUrl)
    {
        if (!_googleOptions.IsConfigured)
            return NotFound(new { error = "Google sign-in is not configured." });

        // Only same-origin SPA paths are accepted as returnUrl to defeat
        // open-redirect attacks. Anything else falls back to the SPA root.
        var safeReturn = SafeReturnUrl(returnUrl);
        // IMPORTANT: this must point to a different path than the Google
        // handler's CallbackPath (`/api/auth/google/callback`). The handler
        // intercepts CallbackPath to validate state+code, then redirects
        // here — if we reused CallbackPath the handler would intercept the
        // post-auth redirect a second time and throw "oauth state was
        // missing or invalid".
        var redirectUri = Url.Action(nameof(GoogleComplete), "Auth", new { returnUrl = safeReturn })
                          ?? "/api/auth/google/complete";
        var props = new AuthenticationProperties { RedirectUri = redirectUri };
        return Challenge(props, GoogleDefaults.AuthenticationScheme);
    }

    /// <summary>
    /// Post-Google completion endpoint. The Google authentication handler
    /// has already validated the OAuth state + code on its own
    /// <c>CallbackPath</c> and signed the external identity into the
    /// <c>ExternalAuth</c> cookie scheme; we just read those claims here,
    /// JIT-provision / look up the matching OnePass user by email, mint a
    /// regular OnePass JWT and bounce the browser to a same-origin SPA
    /// route that stores the token.
    /// </summary>
    [HttpGet("google/complete")]
    [AllowAnonymous]
    public async Task<IActionResult> GoogleComplete([FromQuery] string? returnUrl, CancellationToken ct)
    {
        if (!_googleOptions.IsConfigured)
            return NotFound(new { error = "Google sign-in is not configured." });

        var auth = await HttpContext.AuthenticateAsync("ExternalAuth");
        if (!auth.Succeeded || auth.Principal is null)
        {
            _logger.LogWarning("Google completion received without a valid external cookie.");
            return RedirectToSpa(_googleOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), error: "google_failed");
        }

        var email = auth.Principal.FindFirstValue(ClaimTypes.Email);
        var subject = auth.Principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var displayName = auth.Principal.FindFirstValue(ClaimTypes.Name);
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(subject))
        {
            // Wipe the cookie before bouncing back so the user can retry.
            await HttpContext.SignOutAsync("ExternalAuth");
            _logger.LogWarning("Google completion missing email or subject claim.");
            return RedirectToSpa(_googleOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), error: "google_no_email");
        }

        UserEntity user;
        try
        {
            user = await _users.EnsureExternalAsync(email, displayName, "google", subject, ct);
        }
        catch (InvalidOperationException ex)
        {
            await HttpContext.SignOutAsync("ExternalAuth");
            _logger.LogWarning(ex, "Google completion rejected for {Email}.", email);
            return RedirectToSpa(_googleOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), error: "account_disabled");
        }

        // Drop the temporary external cookie immediately — we only needed it
        // long enough to read the Google claims. From here on the SPA carries
        // the OnePass JWT in localStorage exactly like the password flow.
        await HttpContext.SignOutAsync("ExternalAuth");

        var token = _jwt.CreateToken(user);
        return RedirectToSpa(_googleOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), token: token, expiresIn: _opts.ExpirationMinutes);
    }

    /// <summary>
    /// Start the Microsoft Account OAuth dance. Mirrors
    /// <see cref="GoogleSignIn(string?)"/> — the browser is bounced to
    /// Microsoft's consent screen and on success Microsoft posts back to
    /// the handler's CallbackPath, which then redirects to
    /// <see cref="MicrosoftComplete(string?, CancellationToken)"/>.
    /// </summary>
    [HttpGet("microsoft")]
    [AllowAnonymous]
    [EnableRateLimiting(FairUseRateLimiter.AnonymousPolicyName)]
    public IActionResult MicrosoftSignIn([FromQuery] string? returnUrl)
    {
        if (!_microsoftOptions.IsConfigured)
            return NotFound(new { error = "Microsoft sign-in is not configured." });

        var safeReturn = SafeReturnUrl(returnUrl);
        // Same trap as Google: this RedirectUri MUST differ from the
        // handler's CallbackPath (`/api/auth/microsoft/callback`) or the
        // handler will intercept the post-auth redirect a second time and
        // fail with "oauth state was missing or invalid".
        var redirectUri = Url.Action(nameof(MicrosoftComplete), "Auth", new { returnUrl = safeReturn })
                          ?? "/api/auth/microsoft/complete";
        var props = new AuthenticationProperties { RedirectUri = redirectUri };
        return Challenge(props, MicrosoftAccountDefaults.AuthenticationScheme);
    }

    /// <summary>
    /// Post-Microsoft completion endpoint. The MicrosoftAccount handler
    /// has already validated the OAuth state + code and signed the
    /// external identity into the <c>ExternalAuth</c> cookie scheme; we
    /// read those claims here, JIT-provision / look up the matching
    /// OnePass user by email, mint a regular OnePass JWT and bounce the
    /// browser to the SPA callback route.
    /// </summary>
    [HttpGet("microsoft/complete")]
    [AllowAnonymous]
    public async Task<IActionResult> MicrosoftComplete([FromQuery] string? returnUrl, CancellationToken ct)
    {
        if (!_microsoftOptions.IsConfigured)
            return NotFound(new { error = "Microsoft sign-in is not configured." });

        var auth = await HttpContext.AuthenticateAsync("ExternalAuth");
        if (!auth.Succeeded || auth.Principal is null)
        {
            _logger.LogWarning("Microsoft completion received without a valid external cookie.");
            return RedirectToSpa(_microsoftOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), error: "microsoft_failed");
        }

        // Microsoft Graph sometimes ships only one of the two email-style
        // claims; fall back to upn / preferred_username before giving up.
        var email = auth.Principal.FindFirstValue(ClaimTypes.Email)
                    ?? auth.Principal.FindFirstValue("preferred_username")
                    ?? auth.Principal.FindFirstValue(ClaimTypes.Upn);
        var subject = auth.Principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var displayName = auth.Principal.FindFirstValue(ClaimTypes.Name);
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(subject))
        {
            await HttpContext.SignOutAsync("ExternalAuth");
            _logger.LogWarning("Microsoft completion missing email or subject claim.");
            return RedirectToSpa(_microsoftOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), error: "microsoft_no_email");
        }

        UserEntity user;
        try
        {
            user = await _users.EnsureExternalAsync(email, displayName, "microsoft", subject, ct);
        }
        catch (InvalidOperationException ex)
        {
            await HttpContext.SignOutAsync("ExternalAuth");
            _logger.LogWarning(ex, "Microsoft completion rejected for {Email}.", email);
            return RedirectToSpa(_microsoftOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), error: "account_disabled");
        }

        await HttpContext.SignOutAsync("ExternalAuth");

        var token = _jwt.CreateToken(user);
        return RedirectToSpa(_microsoftOptions.SpaCallbackPath, SafeReturnUrl(returnUrl), token: token, expiresIn: _opts.ExpirationMinutes);
    }

    private IActionResult RedirectToSpa(string spaCallbackPath, string returnUrl, string? token = null, int? expiresIn = null, string? error = null)
    {
        var query = new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            ["returnUrl"] = returnUrl,
        };
        if (!string.IsNullOrEmpty(token)) query["token"] = token;
        if (expiresIn.HasValue) query["expiresIn"] = expiresIn.Value.ToString();
        if (!string.IsNullOrEmpty(error)) query["error"] = error;
        var url = QueryHelpers.AddQueryString(spaCallbackPath, query);
        return Redirect(url);
    }

    private static string SafeReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrWhiteSpace(returnUrl)) return "/";
        // Only same-origin paths are allowed to thwart open redirect attacks.
        if (!returnUrl.StartsWith('/') || returnUrl.StartsWith("//")) return "/";
        return returnUrl;
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<object>> Me(CancellationToken ct)
    {
        var id = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
        var user = id is null ? null : await _users.GetByIdAsync(id, ct);
        return new
        {
            id,
            username = User.Identity?.Name,
            role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value,
            language = User.FindFirst("lang")?.Value ?? "en",
            allowedActivityIds = user?.AllowedActivityIds ?? new List<string>(),
            defaultActivityId = user?.DefaultActivityId,
        };
    }

    [HttpPatch("me")]
    [Authorize]
    public async Task<ActionResult<object>> UpdateMe([FromBody] UpdateUserRequest req, CancellationToken ct)
    {
        var id = User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(id)) return Unauthorized();
        var user = await _users.GetByIdAsync(id, ct);
        if (user is null) return Unauthorized();
        // A regular user can only update their own default activity.
        if (req.DefaultActivityId is not null)
        {
            var d = string.IsNullOrWhiteSpace(req.DefaultActivityId) ? null : req.DefaultActivityId.Trim();
            if (d is not null && user.AllowedActivityIds.Count > 0 && !user.AllowedActivityIds.Contains(d, StringComparer.Ordinal))
                return BadRequest(new { error = "Default activity must be one of the allowed activities." });
            user.DefaultActivityId = d;
            await _users.UpdateAsync(user, ct);
        }
        return new { defaultActivityId = user.DefaultActivityId };
    }

    /// <summary>
    /// Account-enumeration endpoint <c>GET /api/auth/usernames</c> was removed
    /// as part of the SaaS migration's Phase 0 hardening (OWASP A07).
    /// The login UI now requires the user to type their own email/username.
    /// </summary>
    // (intentionally removed — see docs/saas-migration-plan.md §Phase 0)
}

[ApiController]
[Route("api/users")]
[Authorize(Roles = Roles.Admin)]
public class UsersController : ControllerBase
{
    private readonly IUserService _users;

    public UsersController(IUserService users) => _users = users;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserResponse>>> List(CancellationToken ct)
    {
        var list = await _users.ListAsync(ct);
        return Ok(list.Select(Map));
    }

    [HttpPost]
    public async Task<ActionResult<UserResponse>> Create([FromBody] CreateUserRequest req, CancellationToken ct)
    {
        if (req.AllowedActivityIds is null || req.AllowedActivityIds.Count == 0)
            return BadRequest(new { error = "At least one allowed activity must be selected." });
        var allowed = req.AllowedActivityIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToList();
        if (allowed.Count == 0)
            return BadRequest(new { error = "At least one allowed activity must be selected." });
        var defaultId = string.IsNullOrWhiteSpace(req.DefaultActivityId) ? allowed[0] : req.DefaultActivityId!;
        if (!allowed.Contains(defaultId, StringComparer.Ordinal))
            return BadRequest(new { error = "Default activity must be one of the allowed activities." });
        try
        {
            // Admin-side user creation: default missing/empty role to User.
            var role = string.IsNullOrWhiteSpace(req.Role) ? Roles.User : req.Role!;
            var user = await _users.CreateAsync(req.Email, req.Username, req.Password, role, allowed, defaultId, ct);
            return CreatedAtAction(nameof(List), new { id = user.RowKey }, Map(user));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpPatch("{id}")]
    public async Task<ActionResult<UserResponse>> Update(string id, [FromBody] UpdateUserRequest req, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(id, ct);
        if (user is null) return NotFound();
        if (req.IsActive.HasValue) user.IsActive = req.IsActive.Value;
        if (req.AllowedActivityIds is not null)
        {
            var allowed = req.AllowedActivityIds.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.Ordinal).ToList();
            if (allowed.Count == 0)
                return BadRequest(new { error = "At least one allowed activity must be selected." });
            user.AllowedActivityIds = allowed;
            if (user.DefaultActivityId is not null && !allowed.Contains(user.DefaultActivityId, StringComparer.Ordinal))
                user.DefaultActivityId = allowed[0];
        }
        if (req.DefaultActivityId is not null)
        {
            var d = string.IsNullOrWhiteSpace(req.DefaultActivityId) ? null : req.DefaultActivityId.Trim();
            if (d is not null && user.AllowedActivityIds.Count > 0 && !user.AllowedActivityIds.Contains(d, StringComparer.Ordinal))
                return BadRequest(new { error = "Default activity must be one of the allowed activities." });
            user.DefaultActivityId = d;
        }
        await _users.UpdateAsync(user, ct);
        return Map(user);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await _users.DeleteAsync(id, ct);
        return NoContent();
    }

    private static UserResponse Map(UserEntity u) =>
        new(u.RowKey, u.Email, u.Username, u.Role, u.IsActive, u.CreatedAt, u.AllowedActivityIds, u.DefaultActivityId);
}
