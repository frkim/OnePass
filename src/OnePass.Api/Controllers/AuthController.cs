using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
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
    private readonly IPlatformSettingsService _platformSettings;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IUserService users,
        IJwtTokenService jwt,
        JwtOptions opts,
        GoogleAuthOptions googleOptions,
        MicrosoftAuthOptions microsoftOptions,
        IPlatformSettingsService platformSettings,
        ILogger<AuthController> logger)
    {
        _users = users;
        _jwt = jwt;
        _opts = opts;
        _googleOptions = googleOptions;
        _microsoftOptions = microsoftOptions;
        _platformSettings = platformSettings;
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
        var platform = await _platformSettings.GetAsync(ct);
        if (!platform.RegistrationOpen)
            return BadRequest(new { error = "Public registration is currently disabled." });

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
    /// Initiates a password reset. Generates a one-time token (valid 1 hour),
    /// stores a SHA-256 hash of the token on the user entity, and logs the
    /// reset link to the console (no real e-mail in dev). Returns 200 even
    /// when the email is unknown to prevent account enumeration (OWASP A07).
    /// Users who only have external identities (Google / Microsoft) are
    /// silently skipped — they cannot reset a password they never set.
    /// </summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting(FairUseRateLimiter.AnonymousPolicyName)]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req, CancellationToken ct)
    {
        // Always return the same shape to avoid account enumeration.
        var ok = new { message = "If this email is registered, a reset link has been sent." };

        if (string.IsNullOrWhiteSpace(req.Email))
            return Ok(ok);

        var user = await _users.FindByEmailOrUsernameAsync(req.Email.Trim(), ct);
        if (user is null || !user.IsActive)
            return Ok(ok);

        // Skip external-only accounts (Google / Microsoft) — they have no
        // password they could reset.
        if (user.ExternalIdentities.Count > 0 && string.IsNullOrEmpty(user.PasswordHash))
            return Ok(ok);

        // Generate a cryptographically random token
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

        // Store the SHA-256 hash so that a DB leak doesn't grant reset access.
        user.PasswordResetTokenHash = HashToken(rawToken);
        user.PasswordResetTokenExpiry = DateTimeOffset.UtcNow.AddHours(1);
        await _users.UpdateAsync(user, ct);

        // In a production system this would be an email. For dev we log the
        // link to the console so testers can copy-paste it.
        var resetUrl = $"{Request.Scheme}://{Request.Host}/reset-password?token={Uri.EscapeDataString(rawToken)}";
        _logger.LogWarning("PASSWORD RESET LINK for {Email}: {Url}", user.Email, resetUrl);

        return Ok(ok);
    }

    /// <summary>
    /// Completes a password reset. Validates the token, checks expiry,
    /// enforces password complexity, and updates the hash.
    /// </summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting(FairUseRateLimiter.AnonymousPolicyName)]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Token) || string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest(new { error = "Token and new password are required." });

        var tokenHash = HashToken(req.Token);

        // Find the user whose stored hash matches.
        UserEntity? user = null;
        var allUsers = await _users.ListAsync(ct);
        foreach (var u in allUsers)
        {
            if (!string.IsNullOrEmpty(u.PasswordResetTokenHash) &&
                u.PasswordResetTokenHash == tokenHash)
            {
                user = u;
                break;
            }
        }

        if (user is null || user.PasswordResetTokenExpiry is null || user.PasswordResetTokenExpiry < DateTimeOffset.UtcNow)
            return BadRequest(new { error = "This reset link is invalid or has expired." });

        // Enforce the same password policy as registration.
        if (req.NewPassword.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });
        if (!req.NewPassword.Any(char.IsUpper))
            return BadRequest(new { error = "Password must contain at least one uppercase letter." });
        if (!req.NewPassword.Any(c => !char.IsLetterOrDigit(c)))
            return BadRequest(new { error = "Password must contain at least one special character." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.PasswordResetTokenHash = null;
        user.PasswordResetTokenExpiry = null;
        await _users.UpdateAsync(user, ct);

        _logger.LogInformation("Password reset completed for {Email}.", user.Email);
        return Ok(new { message = "Password has been reset successfully." });
    }

    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToBase64String(bytes);
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
    /// Public platform status: maintenance banner and registration flag.
    /// Consumed by the SPA shell (AppLayout) on every page load so the
    /// banner appears for all users — including unauthenticated visitors.
    /// </summary>
    [HttpGet("platform-status")]
    [AllowAnonymous]
    public async Task<IActionResult> PlatformStatus(CancellationToken ct)
    {
        var s = await _platformSettings.GetAsync(ct);
        return Ok(new
        {
            registrationOpen = s.RegistrationOpen,
            maintenanceMessage = s.MaintenanceMessage,
        });
    }

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
            displayName = user?.DisplayName ?? User.Identity?.Name,
            role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value,
            language = User.FindFirst("lang")?.Value ?? "en",
            allowedActivityIds = user?.AllowedActivityIds ?? new List<string>(),
            defaultActivityId = user?.DefaultActivityId,
            defaultEventId = user?.DefaultEventId,
        };
    }

    [HttpPatch("me")]
    [Authorize]
    public async Task<ActionResult<object>> UpdateMe([FromBody] UpdateMeRequest req, CancellationToken ct)
    {
        var id = User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(id)) return Unauthorized();
        var user = await _users.GetByIdAsync(id, ct);
        if (user is null) return Unauthorized();

        if (req.DefaultActivityId is not null)
        {
            var d = string.IsNullOrWhiteSpace(req.DefaultActivityId) ? null : req.DefaultActivityId.Trim();
            if (d is not null && user.AllowedActivityIds.Count > 0 && !user.AllowedActivityIds.Contains(d, StringComparer.Ordinal))
                return BadRequest(new { error = "Default activity must be one of the allowed activities." });
            user.DefaultActivityId = d;
        }
        if (req.DefaultEventId is not null)
        {
            user.DefaultEventId = string.IsNullOrWhiteSpace(req.DefaultEventId) ? null : req.DefaultEventId.Trim();
        }
        if (req.DisplayName is not null)
        {
            user.DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? null : req.DisplayName.Trim();
        }
        if (req.Language is not null)
        {
            var lang = req.Language.Trim().ToLowerInvariant();
            if (new[] { "en", "fr", "es", "de" }.Contains(lang))
            {
                user.PreferredLanguage = lang;
                user.Locale = lang;
            }
        }
        await _users.UpdateAsync(user, ct);
        return new { defaultActivityId = user.DefaultActivityId, defaultEventId = user.DefaultEventId, displayName = user.DisplayName ?? user.Username, language = user.PreferredLanguage };
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
    private readonly ITenantContext _tenant;
    private readonly IMembershipService _memberships;

    public UsersController(IUserService users, ITenantContext tenant, IMembershipService memberships)
    {
        _users = users;
        _tenant = tenant;
        _memberships = memberships;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserResponse>>> List(CancellationToken ct)
    {
        if (!_tenant.HasTenant)
            return Ok(Enumerable.Empty<UserResponse>());

        var members = await _memberships.ListForOrgAsync(_tenant.OrgId, ct);
        var memberUserIds = members.Select(m => m.UserId).ToHashSet(StringComparer.Ordinal);

        var allUsers = await _users.ListAsync(ct);
        var filtered = allUsers
            .Where(u => u.Role != Roles.GlobalAdmin && memberUserIds.Contains(u.RowKey))
            .Select(Map);
        return Ok(filtered);
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
        var user = await _users.GetByIdAsync(id, ct);
        if (user is null) return NotFound();

        // Prevent deleting the last Admin in the current organisation.
        if (user.Role == Roles.Admin && _tenant.HasTenant)
        {
            var members = await _memberships.ListForOrgAsync(_tenant.OrgId, ct);
            var memberUserIds = members.Select(m => m.UserId).ToHashSet(StringComparer.Ordinal);
            var allUsers = await _users.ListAsync(ct);
            var adminCount = allUsers.Count(u => u.Role == Roles.Admin && u.RowKey != id && memberUserIds.Contains(u.RowKey));
            if (adminCount == 0)
                return Conflict(new { code = "last_admin", error = "Cannot delete the last admin of the organisation." });
        }

        await _users.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id}/reset-password")]
    public async Task<IActionResult> AdminResetPassword(string id, [FromBody] AdminResetPasswordRequest req, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(id, ct);
        if (user is null) return NotFound();

        if (string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest(new { error = "New password is required." });
        if (req.NewPassword.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });
        if (!req.NewPassword.Any(char.IsUpper))
            return BadRequest(new { error = "Password must contain at least one uppercase letter." });
        if (!req.NewPassword.Any(c => !char.IsLetterOrDigit(c)))
            return BadRequest(new { error = "Password must contain at least one special character." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.PasswordResetTokenHash = null;
        user.PasswordResetTokenExpiry = null;
        await _users.UpdateAsync(user, ct);

        return Ok(new { message = "Password has been reset successfully." });
    }

    private static UserResponse Map(UserEntity u) =>
        new(u.RowKey, u.Email, u.Username, u.Role, u.IsActive, u.CreatedAt, u.AllowedActivityIds, u.DefaultActivityId);
}
