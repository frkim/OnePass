using Azure;
using Azure.Data.Tables;

namespace OnePass.Api.Models;

/// <summary>
/// Authenticated user (Admin or User). Participants are a separate entity
/// and do not require authentication.
/// </summary>
public class UserEntity : ITableEntity
{
    public string PartitionKey { get; set; } = "User";
    public string RowKey { get; set; } = Guid.NewGuid().ToString("N");
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = Roles.User;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string PreferredLanguage { get; set; } = "en";
}
