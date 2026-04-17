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
    public ActionResult<object> Me()
    {
        return new
        {
            id = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value,
            username = User.Identity?.Name,
            role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value,
            language = User.FindFirst("lang")?.Value ?? "en",
        };
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
        try
        {
            var user = await _users.CreateAsync(req.Email, req.Username, req.Password, req.Role, ct);
            return CreatedAtAction(nameof(List), new { id = user.RowKey }, Map(user));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await _users.DeleteAsync(id, ct);
        return NoContent();
    }

    private static UserResponse Map(UserEntity u) =>
        new(u.RowKey, u.Email, u.Username, u.Role, u.IsActive, u.CreatedAt);
}
