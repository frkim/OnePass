using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

    public AuthController(IUserService users, IJwtTokenService jwt, JwtOptions opts)
    {
        _users = users;
        _jwt = jwt;
        _opts = opts;
    }

    [HttpPost("login")]
    [AllowAnonymous]
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
    public async Task<ActionResult<LoginResponse>> Register([FromBody] CreateUserRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "Email and password are required." });
        try
        {
            var user = await _users.CreateAsync(req.Email, req.Username, req.Password, Roles.User, ct);
            var token = _jwt.CreateToken(user);
            return new LoginResponse(token, user.RowKey, user.Username, user.Role, _opts.ExpirationMinutes);
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
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
    /// Returns the list of usernames for autocomplete on the login page.
    /// NOTE: anonymous endpoint — exposes account identifiers and aids enumeration.
    /// Disable for any non-demo deployment.
    /// </summary>
    [HttpGet("usernames")]
    [AllowAnonymous]
    public async Task<ActionResult<IEnumerable<string>>> Usernames(CancellationToken ct)
    {
        var list = await _users.ListAsync(ct);
        return Ok(list.Where(u => u.IsActive).Select(u => u.Username).OrderBy(n => n));
    }
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
            var user = await _users.CreateAsync(req.Email, req.Username, req.Password, req.Role, allowed, defaultId, ct);
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
