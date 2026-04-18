namespace OnePass.Api.Dtos;

public record LoginRequest(string EmailOrUsername, string Password);
public record LoginResponse(string Token, string UserId, string Username, string Role, int ExpiresInMinutes);

public record CreateUserRequest(
    string Email,
    string Username,
    string Password,
    string Role,
    IReadOnlyList<string>? AllowedActivityIds = null,
    string? DefaultActivityId = null);

public record UserResponse(
    string Id,
    string Email,
    string Username,
    string Role,
    bool IsActive,
    DateTimeOffset CreatedAt,
    IReadOnlyList<string> AllowedActivityIds,
    string? DefaultActivityId);

public record UpdateUserRequest(
    bool? IsActive = null,
    string? DefaultActivityId = null,
    IReadOnlyList<string>? AllowedActivityIds = null);

public record CreateActivityRequest(
    string Name,
    string? Description,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    int MaxScansPerParticipant = 1);

public record ActivityResponse(
    string Id,
    string Name,
    string? Description,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    int MaxScansPerParticipant,
    bool IsActive,
    bool IsDefault);

public record CreateParticipantRequest(string DisplayName, string? Email);
public record ParticipantResponse(string Id, string ActivityId, string DisplayName, string? Email);

public record RecordScanRequest(string ActivityId, string ParticipantId);
public record ScanResponse(string Id, string ActivityId, string ParticipantId, string ScannedByUserId, DateTimeOffset ScannedAt);

public record SettingsResponse(string EventName, string? DefaultActivityId);
public record UpdateSettingsRequest(string? EventName, string? DefaultActivityId);
