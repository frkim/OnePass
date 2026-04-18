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

// ---- SaaS (multi-tenant) DTOs ----

public record OrganizationResponse(
    string Id,
    string Name,
    string Slug,
    string OwnerUserId,
    string Status,
    string Region,
    string Plan,
    DateTimeOffset CreatedAt,
    string? PreviousSlug,
    string? BrandingLogoUrl,
    string? BrandingPrimaryColor);

public record CreateOrganizationRequest(string Name, string? Slug);
public record UpdateOrganizationRequest(
    string? Name = null,
    string? Slug = null,
    string? BrandingLogoUrl = null,
    string? BrandingPrimaryColor = null,
    int? RetentionDays = null);

public record MembershipResponse(
    string OrgId,
    string UserId,
    string Role,
    string Status,
    DateTimeOffset JoinedAt,
    IReadOnlyList<string> AllowedActivityIds,
    string? DefaultActivityId,
    string? DefaultEventId);

public record UpdateMembershipRequest(
    string? Role = null,
    string? Status = null,
    IReadOnlyList<string>? AllowedActivityIds = null,
    string? DefaultActivityId = null,
    string? DefaultEventId = null);

public record EventResponse(
    string Id,
    string OrgId,
    string Name,
    string Slug,
    string? Description,
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt,
    string? Venue,
    string? DefaultActivityId,
    bool IsArchived);

public record CreateEventRequest(string Name, string? Slug = null);
public record UpdateEventRequest(
    string? Name = null,
    string? Description = null,
    DateTimeOffset? StartsAt = null,
    DateTimeOffset? EndsAt = null,
    string? Venue = null,
    string? DefaultActivityId = null,
    bool? IsArchived = null);

public record InvitationResponse(
    string Token,
    string OrgId,
    string Email,
    string Role,
    string InvitedByUserId,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    string? AcceptedByUserId,
    DateTimeOffset? AcceptedAt);

public record CreateInvitationRequest(string Email, string Role);
public record AuditEventResponse(
    string Id,
    string OrgId,
    string ActorUserId,
    string Action,
    string TargetType,
    string TargetId,
    string? Metadata,
    DateTimeOffset OccurredAt);

public record OrgSummary(
    string Id,
    string Name,
    string Slug,
    string Role,
    string Status);
