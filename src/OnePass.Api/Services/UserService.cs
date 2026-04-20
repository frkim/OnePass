using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IUserService
{
    Task<UserEntity?> FindByEmailOrUsernameAsync(string emailOrUsername, CancellationToken ct = default);
    Task<UserEntity?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<UserEntity> CreateAsync(string email, string username, string password, string role, CancellationToken ct = default);
    Task<UserEntity> CreateAsync(string email, string username, string password, string role, IReadOnlyList<string>? allowedActivityIds, string? defaultActivityId, CancellationToken ct = default);

    /// <summary>
    /// Find an existing user by email; if none exists, JIT-provision one
    /// for an external/federated identity (e.g. Google). The new user gets
    /// the regular <see cref="Roles.User"/> role and a random password
    /// hash they can never know — they must keep using the federated
    /// provider, or trigger a password-reset (planned, Phase L).
    /// </summary>
    Task<UserEntity> EnsureExternalAsync(string email, string? displayName, string provider, string providerSubject, CancellationToken ct = default);
    Task<IReadOnlyList<UserEntity>> ListAsync(CancellationToken ct = default);
    Task UpdateAsync(UserEntity user, CancellationToken ct = default);
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

    public Task<UserEntity> CreateAsync(string email, string username, string password, string role, CancellationToken ct = default) =>
        CreateAsync(email, username, password, role, null, null, ct);

    public async Task<UserEntity> CreateAsync(string email, string username, string password, string role, IReadOnlyList<string>? allowedActivityIds, string? defaultActivityId, CancellationToken ct = default)
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
            AllowedActivityIds = allowedActivityIds is null
                ? new List<string>()
                : allowedActivityIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToList(),
            DefaultActivityId = string.IsNullOrWhiteSpace(defaultActivityId) ? null : defaultActivityId.Trim(),
        };
        await _users.UpsertAsync(user, ct);
        return user;
    }

    public Task UpdateAsync(UserEntity user, CancellationToken ct = default)
    {
        user.PartitionKey = "User";
        return _users.UpsertAsync(user, ct);
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

    public async Task<UserEntity> EnsureExternalAsync(string email, string? displayName, string provider, string providerSubject, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email)) throw new ArgumentException("Email required", nameof(email));
        if (string.IsNullOrWhiteSpace(provider)) throw new ArgumentException("Provider required", nameof(provider));
        if (string.IsNullOrWhiteSpace(providerSubject)) throw new ArgumentException("Provider subject required", nameof(providerSubject));

        var normalisedEmail = email.Trim().ToLowerInvariant();
        var existing = await FindByEmailOrUsernameAsync(normalisedEmail, ct);
        if (existing is not null)
        {
            if (!existing.IsActive)
                throw new InvalidOperationException("Account is disabled.");
            return existing;
        }

        // Pick a username we know is unique. Use the local-part of the email
        // as a starting point and fall back to a numbered variant on conflict.
        var baseUsername = normalisedEmail.Split('@')[0];
        var username = baseUsername;
        var suffix = 1;
        while (await FindByEmailOrUsernameAsync(username, ct) is not null)
        {
            suffix++;
            username = $"{baseUsername}{suffix}";
            if (suffix > 1000)
                throw new InvalidOperationException("Could not allocate a unique username for federated sign-in.");
        }

        // The user can never log in with a password — they must keep using
        // the federated provider. We still write a random hash so the
        // PasswordHash column is never null and BCrypt.Verify will always
        // fail in constant time even if the row is exfiltrated.
        var randomPassword = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        var user = new UserEntity
        {
            Email = normalisedEmail,
            Username = string.IsNullOrWhiteSpace(displayName) ? username : displayName.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(randomPassword),
            Role = Roles.User,
            AllowedActivityIds = new List<string>(),
            DefaultActivityId = null,
        };
        await _users.UpsertAsync(user, ct);
        return user;
    }
}
