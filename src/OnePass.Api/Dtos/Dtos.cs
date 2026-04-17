namespace OnePass.Api.Dtos;

public record LoginRequest(string EmailOrUsername, string Password);
public record LoginResponse(string Token, string UserId, string Username, string Role, int ExpiresInMinutes);

public record CreateUserRequest(string Email, string Username, string Password, string Role);
public record UserResponse(string Id, string Email, string Username, string Role, bool IsActive, DateTimeOffset CreatedAt);

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
    bool IsActive);

public record CreateParticipantRequest(string DisplayName, string? Email);
public record ParticipantResponse(string Id, string ActivityId, string DisplayName, string? Email);

public record RecordScanRequest(string ActivityId, string ParticipantId);
public record ScanResponse(string Id, string ActivityId, string ParticipantId, string ScannedByUserId, DateTimeOffset ScannedAt);
