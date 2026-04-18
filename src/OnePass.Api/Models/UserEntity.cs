using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// Authenticated user (Admin or User). Participants are a separate entity
/// and do not require authentication.
/// </summary>
public class UserEntity : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = "User";

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = Guid.NewGuid().ToString("N");

    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = Roles.User;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string PreferredLanguage { get; set; } = "en";
}
