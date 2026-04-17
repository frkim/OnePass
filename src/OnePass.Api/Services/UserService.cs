using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IUserService
{
    Task<UserEntity?> FindByEmailOrUsernameAsync(string emailOrUsername, CancellationToken ct = default);
    Task<UserEntity?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<UserEntity> CreateAsync(string email, string username, string password, string role, CancellationToken ct = default);
    Task<IReadOnlyList<UserEntity>> ListAsync(CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
    bool VerifyPassword(UserEntity user, string password);
}

public sealed class UserService : IUserService
{
    internal const string TableName = "users";
    private readonly ITableRepository<UserEntity> _users;

    public UserService(ITableStoreFactory factory)
    {
        _users = factory.GetRepository<UserEntity>(TableName);
    }

    public async Task<UserEntity?> FindByEmailOrUsernameAsync(string emailOrUsername, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(emailOrUsername)) return null;
        var needle = emailOrUsername.Trim().ToLowerInvariant();
        await foreach (var u in _users.QueryAsync(null, ct))
        {
            if (u.Email.Equals(needle, StringComparison.OrdinalIgnoreCase) ||
                u.Username.Equals(needle, StringComparison.OrdinalIgnoreCase))
                return u;
        }
        return null;
    }

    public Task<UserEntity?> GetByIdAsync(string id, CancellationToken ct = default) =>
        _users.GetAsync("User", id, ct);

    public async Task<UserEntity> CreateAsync(string email, string username, string password, string role, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email)) throw new ArgumentException("Email required", nameof(email));
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            throw new ArgumentException("Password must be at least 8 characters", nameof(password));
        if (!Roles.All.Contains(role))
            throw new ArgumentException($"Unknown role '{role}'", nameof(role));

        var existing = await FindByEmailOrUsernameAsync(email, ct);
        if (existing is not null) throw new InvalidOperationException("A user with this email or username already exists.");

        var user = new UserEntity
        {
            Email = email.Trim().ToLowerInvariant(),
            Username = string.IsNullOrWhiteSpace(username) ? email : username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = role,
        };
        await _users.UpsertAsync(user, ct);
        return user;
    }

    public async Task<IReadOnlyList<UserEntity>> ListAsync(CancellationToken ct = default)
    {
        var results = new List<UserEntity>();
        await foreach (var u in _users.QueryAsync(null, ct)) results.Add(u);
        return results;
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) => _users.DeleteAsync("User", id, ct);

    public bool VerifyPassword(UserEntity user, string password) =>
        !string.IsNullOrEmpty(user.PasswordHash) &&
        BCrypt.Net.BCrypt.Verify(password, user.PasswordHash);
}
