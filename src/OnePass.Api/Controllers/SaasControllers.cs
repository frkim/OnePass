using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnePass.Api.Auth;
using OnePass.Api.Dtos;
using OnePass.Api.Models;
using OnePass.Api.Services;

namespace OnePass.Api.Controllers;

// =============================================================================
//  /api/me/orgs  — user-centric: list orgs I belong to + switch active org
// =============================================================================

[ApiController]
[Route("api/me")]
[Authorize]
public class MeOrgsController : ControllerBase
{
    private readonly IMembershipService _memberships;
    private readonly IOrganizationService _orgs;
    private readonly IUserService _users;

    public MeOrgsController(IMembershipService memberships, IOrganizationService orgs, IUserService users)
    {
        _memberships = memberships;
        _orgs = orgs;
        _users = users;
    }

    [HttpGet("orgs")]
    public async Task<ActionResult<IEnumerable<OrgSummary>>> ListMyOrgs(CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var ms = await _memberships.ListForUserAsync(userId, ct);
        var summaries = new List<OrgSummary>();
        foreach (var m in ms)
        {
            var o = await _orgs.GetAsync(m.OrgId, ct);
            if (o is null || o.Status != OrganizationStatus.Active) continue;
            summaries.Add(new OrgSummary(o.RowKey, o.Name, o.Slug, m.Role, m.Status));
        }
        return Ok(summaries.OrderBy(s => s.Name));
    }

    public record SwitchOrgRequest(string OrgId);

    [HttpPost("active-org")]
    public async Task<ActionResult<OrgSummary>> SwitchActiveOrg([FromBody] SwitchOrgRequest req, CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.OrgId)) return BadRequest(new { error = "OrgId required." });
        var membership = await _memberships.GetAsync(req.OrgId, userId, ct);
        if (membership is null || membership.Status != MembershipStatus.Active)
            return Forbid();
        var org = await _orgs.GetAsync(req.OrgId, ct);
        if (org is null || org.Status != OrganizationStatus.Active) return NotFound();

        var user = await _users.GetByIdAsync(userId, ct);
        if (user is not null)
        {
            user.DefaultOrgId = org.RowKey;
            await _users.UpdateAsync(user, ct);
        }
        return new OrgSummary(org.RowKey, org.Name, org.Slug, membership.Role, membership.Status);
    }
}

// =============================================================================
//  /api/orgs  — org CRUD + lookup
// =============================================================================

[ApiController]
[Route("api/orgs")]
[Authorize]
public class OrganizationsController : ControllerBase
{
    private readonly IOrganizationService _orgs;
    private readonly IMembershipService _memberships;
    private readonly IEventService _events;
    private readonly IUserService _users;
    private readonly IAuditService _audit;
    private readonly ITenantContext _tenant;

    public OrganizationsController(
        IOrganizationService orgs,
        IMembershipService memberships,
        IEventService events,
        IUserService users,
        IAuditService audit,
        ITenantContext tenant)
    {
        _orgs = orgs;
        _memberships = memberships;
        _events = events;
        _users = users;
        _audit = audit;
        _tenant = tenant;
    }

    /// <summary>
    /// Self-service org creation. The caller becomes <see cref="OrgRoles.OrgOwner"/>
    /// and the org is automatically given a default <see cref="EventEntity"/>.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<OrganizationResponse>> Create([FromBody] CreateOrganizationRequest req, CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        try
        {
            var slug = string.IsNullOrWhiteSpace(req.Slug) ? OrganizationService.NormaliseSlug(req.Name) : req.Slug!;
            var org = await _orgs.CreateAsync(req.Name, slug, userId, req.OrgId, ct);
            await _memberships.AddAsync(org.RowKey, userId, OrgRoles.OrgOwner, ct: ct);
            // Seed a default event so the org is immediately usable.
            await _events.CreateAsync(org.RowKey, $"{org.Name} default event", "default", userId, ct);
            // Default the user's preferred org to the freshly-created one if unset.
            var user = await _users.GetByIdAsync(userId, ct);
            if (user is not null && string.IsNullOrEmpty(user.DefaultOrgId))
            {
                user.DefaultOrgId = org.RowKey;
                await _users.UpdateAsync(user, ct);
            }
            await _audit.LogAsync(org.RowKey, userId, AuditActions.OrganizationCreate, "Organization", org.RowKey,
                new { org.Name, org.Slug }, HttpContext.Connection.RemoteIpAddress?.ToString(),
                Request.Headers.UserAgent.FirstOrDefault(), ct);
            return CreatedAtAction(nameof(Get), new { orgId = org.RowKey }, Map(org));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpGet("{orgId}")]
    public async Task<ActionResult<OrganizationResponse>> Get(string orgId, CancellationToken ct)
    {
        // Caller must be a member (any active role) — enforced via tenant context.
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        var m = await _memberships.GetAsync(orgId, userId, ct);
        if (m is null || m.Status != MembershipStatus.Active)
        {
            // Platform admins may inspect any org.
            if (!User.IsInRole(OrgRoles.PlatformAdmin) && !User.IsInRole(Roles.Admin))
                return Forbid();
        }
        var org = await _orgs.GetAsync(orgId, ct);
        if (org is null) return NotFound();
        return Map(org);
    }

    [HttpPatch("{orgId}")]
    public async Task<ActionResult<OrganizationResponse>> Update(string orgId, [FromBody] UpdateOrganizationRequest req, CancellationToken ct)
    {
        if (!RequireOrgAdmin(orgId, out var failure)) return failure!;
        var org = await _orgs.GetAsync(orgId, ct);
        if (org is null) return NotFound();
        try
        {
            if (!string.IsNullOrWhiteSpace(req.Name)) org.Name = req.Name.Trim();
            if (req.BrandingLogoUrl is not null) org.BrandingLogoUrl = string.IsNullOrWhiteSpace(req.BrandingLogoUrl) ? null : req.BrandingLogoUrl.Trim();
            if (req.BrandingPrimaryColor is not null) org.BrandingPrimaryColor = string.IsNullOrWhiteSpace(req.BrandingPrimaryColor) ? null : req.BrandingPrimaryColor.Trim();
            if (req.RetentionDays.HasValue) org.RetentionDays = req.RetentionDays.Value > 0 ? req.RetentionDays.Value : null;
            await _orgs.UpdateAsync(org, ct);
            if (!string.IsNullOrWhiteSpace(req.Slug))
                org = await _orgs.RenameSlugAsync(orgId, req.Slug!, ct);

            var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
            await _audit.LogAsync(orgId, actor, AuditActions.OrganizationUpdate, "Organization", orgId, req, ct: ct);
            return Map(org);
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    /// <summary>Soft-deletes the org (status → Deleted). OrgOwner only.</summary>
    [HttpDelete("{orgId}")]
    public async Task<IActionResult> Delete(string orgId, CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        var m = await _memberships.GetAsync(orgId, userId, ct);
        var legacyAdmin = User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin);
        if (!legacyAdmin && (m is null || m.Role != OrgRoles.OrgOwner)) return Forbid();
        await _orgs.SoftDeleteAsync(orgId, ct);
        await _audit.LogAsync(orgId, userId, AuditActions.OrganizationDelete, "Organization", orgId, ct: ct);
        return NoContent();
    }

    private bool RequireOrgAdmin(string orgId, out ActionResult? failure)
    {
        failure = null;
        if (User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin)) return true;
        if (!_tenant.HasTenant ||
            !string.Equals(_tenant.OrgId, orgId, StringComparison.Ordinal) ||
            !OrgRoles.OrgAdminOrAbove.Contains(_tenant.Role, StringComparer.Ordinal))
        {
            failure = Forbid();
            return false;
        }
        return true;
    }

    internal static OrganizationResponse Map(OrganizationEntity o) =>
        new(o.RowKey, o.Name, o.Slug, o.OwnerUserId, o.Status, o.Region, o.Plan, o.CreatedAt,
            o.PreviousSlug, o.BrandingLogoUrl, o.BrandingPrimaryColor);
}

// =============================================================================
//  /api/orgs/{orgId}/memberships  — invite / list / patch / leave
// =============================================================================

[ApiController]
[Route("api/orgs/{orgId}/memberships")]
[Authorize]
public class MembershipsController : ControllerBase
{
    private readonly IMembershipService _memberships;
    private readonly IUserService _users;
    private readonly IAuditService _audit;
    private readonly ITenantContext _tenant;

    public MembershipsController(IMembershipService memberships, IUserService users, IAuditService audit, ITenantContext tenant)
    {
        _memberships = memberships;
        _users = users;
        _audit = audit;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<MembershipResponse>>> List(string orgId, CancellationToken ct)
    {
        if (!RequireMember(orgId, out var failure)) return failure!;
        var list = await _memberships.ListForOrgAsync(orgId, ct);
        return Ok(list.Select(Map));
    }

    [HttpGet("{userId}")]
    public async Task<ActionResult<MembershipResponse>> Get(string orgId, string userId, CancellationToken ct)
    {
        if (!RequireMember(orgId, out var failure)) return failure!;
        var m = await _memberships.GetAsync(orgId, userId, ct);
        if (m is null || m.Status == MembershipStatus.Removed) return NotFound();
        return Map(m);
    }

    [HttpPatch("{userId}")]
    public async Task<ActionResult<MembershipResponse>> Update(string orgId, string userId, [FromBody] UpdateMembershipRequest req, CancellationToken ct)
    {
        if (!RequireOrgAdmin(orgId, out var failure)) return failure!;
        var m = await _memberships.GetAsync(orgId, userId, ct);
        if (m is null || m.Status == MembershipStatus.Removed) return NotFound();

        if (!string.IsNullOrWhiteSpace(req.Role))
        {
            if (!OrgRoles.IsValid(req.Role!)) return BadRequest(new { error = $"Unknown role '{req.Role}'." });
            // OrgOwner can only be assigned/removed by another OrgOwner or platform admin.
            if ((req.Role == OrgRoles.OrgOwner || m.Role == OrgRoles.OrgOwner)
                && _tenant.Role != OrgRoles.OrgOwner
                && !User.IsInRole(Roles.Admin)
                && !User.IsInRole(OrgRoles.PlatformAdmin))
                return Forbid();
            m.Role = req.Role!;
        }
        if (!string.IsNullOrWhiteSpace(req.Status))
        {
            if (!MembershipStatus.IsValid(req.Status!)) return BadRequest(new { error = $"Unknown status '{req.Status}'." });
            m.Status = req.Status!;
        }
        if (req.AllowedActivityIds is not null)
        {
            m.AllowedActivityIds = req.AllowedActivityIds
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.Ordinal)
                .ToList();
            if (m.DefaultActivityId is not null && m.AllowedActivityIds.Count > 0
                && !m.AllowedActivityIds.Contains(m.DefaultActivityId, StringComparer.Ordinal))
                m.DefaultActivityId = m.AllowedActivityIds[0];
        }
        if (req.DefaultActivityId is not null)
        {
            var d = string.IsNullOrWhiteSpace(req.DefaultActivityId) ? null : req.DefaultActivityId.Trim();
            if (d is not null && m.AllowedActivityIds.Count > 0 && !m.AllowedActivityIds.Contains(d, StringComparer.Ordinal))
                return BadRequest(new { error = "Default activity must be one of the allowed activities." });
            m.DefaultActivityId = d;
        }
        if (req.DefaultEventId is not null)
            m.DefaultEventId = string.IsNullOrWhiteSpace(req.DefaultEventId) ? null : req.DefaultEventId.Trim();

        await _memberships.UpdateAsync(m, ct);
        var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        await _audit.LogAsync(orgId, actor, AuditActions.MembershipUpdate, "Membership", userId, req, ct: ct);
        return Map(m);
    }

    [HttpPatch("me")]
    public async Task<ActionResult<MembershipResponse>> UpdateMe(string orgId, [FromBody] UpdateMembershipRequest req, CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var m = await _memberships.GetAsync(orgId, userId, ct);
        if (m is null || m.Status != MembershipStatus.Active) return NotFound();
        // Members can only update their own default activity / default event.
        // They cannot change their own role or status.
        if (req.DefaultActivityId is not null)
        {
            var d = string.IsNullOrWhiteSpace(req.DefaultActivityId) ? null : req.DefaultActivityId.Trim();
            if (d is not null && m.AllowedActivityIds.Count > 0 && !m.AllowedActivityIds.Contains(d, StringComparer.Ordinal))
                return BadRequest(new { error = "Default activity must be one of the allowed activities." });
            m.DefaultActivityId = d;
        }
        if (req.DefaultEventId is not null)
            m.DefaultEventId = string.IsNullOrWhiteSpace(req.DefaultEventId) ? null : req.DefaultEventId.Trim();
        await _memberships.UpdateAsync(m, ct);
        return Map(m);
    }

    [HttpDelete("me")]
    public async Task<IActionResult> LeaveOrg(string orgId, CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var m = await _memberships.GetAsync(orgId, userId, ct);
        if (m is null) return NoContent();
        // Last OrgOwner cannot leave.
        if (m.Role == OrgRoles.OrgOwner)
        {
            var others = await _memberships.ListForOrgAsync(orgId, ct);
            if (others.Count(x => x.Role == OrgRoles.OrgOwner && x.UserId != userId) == 0)
                return Conflict(new { error = "Transfer ownership before leaving — last owner cannot leave." });
        }
        await _memberships.RemoveAsync(orgId, userId, ct);
        await _audit.LogAsync(orgId, userId, AuditActions.MembershipRemove, "Membership", userId, ct: ct);
        return NoContent();
    }

    [HttpDelete("{userId}")]
    public async Task<IActionResult> Remove(string orgId, string userId, CancellationToken ct)
    {
        if (!RequireOrgAdmin(orgId, out var failure)) return failure!;
        var m = await _memberships.GetAsync(orgId, userId, ct);
        if (m is null) return NoContent();
        if (m.Role == OrgRoles.OrgOwner)
        {
            var owners = (await _memberships.ListForOrgAsync(orgId, ct)).Count(x => x.Role == OrgRoles.OrgOwner);
            if (owners <= 1) return Conflict(new { error = "Cannot remove the last owner." });
        }
        await _memberships.RemoveAsync(orgId, userId, ct);
        var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        await _audit.LogAsync(orgId, actor, AuditActions.MembershipRemove, "Membership", userId, ct: ct);
        return NoContent();
    }

    private bool RequireMember(string orgId, out ActionResult? failure)
    {
        failure = null;
        if (User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin)) return true;
        if (!_tenant.HasTenant || !string.Equals(_tenant.OrgId, orgId, StringComparison.Ordinal))
        { failure = Forbid(); return false; }
        return true;
    }

    private bool RequireOrgAdmin(string orgId, out ActionResult? failure)
    {
        failure = null;
        if (User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin)) return true;
        if (!_tenant.HasTenant || !string.Equals(_tenant.OrgId, orgId, StringComparison.Ordinal) ||
            !OrgRoles.OrgAdminOrAbove.Contains(_tenant.Role, StringComparer.Ordinal))
        { failure = Forbid(); return false; }
        return true;
    }

    internal static MembershipResponse Map(MembershipEntity m) =>
        new(m.OrgId, m.UserId, m.Role, m.Status, m.JoinedAt, m.AllowedActivityIds, m.DefaultActivityId, m.DefaultEventId);
}

// =============================================================================
//  /api/orgs/{orgId}/invitations
// =============================================================================

[ApiController]
[Route("api/orgs/{orgId}/invitations")]
[Authorize]
public class InvitationsController : ControllerBase
{
    private readonly IInvitationService _invitations;
    private readonly IMembershipService _memberships;
    private readonly IUserService _users;
    private readonly IAuditService _audit;
    private readonly ITenantContext _tenant;

    public InvitationsController(IInvitationService invitations, IMembershipService memberships,
        IUserService users, IAuditService audit, ITenantContext tenant)
    {
        _invitations = invitations;
        _memberships = memberships;
        _users = users;
        _audit = audit;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<InvitationResponse>>> List(string orgId, CancellationToken ct)
    {
        if (!RequireOrgAdmin(orgId, out var failure)) return failure!;
        var list = await _invitations.ListForOrgAsync(orgId, ct);
        return Ok(list.Select(Map));
    }

    [HttpPost]
    public async Task<ActionResult<InvitationResponse>> Create(string orgId, [FromBody] CreateInvitationRequest req, CancellationToken ct)
    {
        if (!RequireOrgAdmin(orgId, out var failure)) return failure!;
        var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        try
        {
            var inv = await _invitations.CreateAsync(orgId, req.Email, req.Role, actor, ct: ct);
            await _audit.LogAsync(orgId, actor, AuditActions.MembershipInvite, "Invitation", inv.RowKey, new { req.Email, req.Role }, ct: ct);
            return CreatedAtAction(nameof(List), new { orgId }, Map(inv));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPost("{token}/accept")]
    [AllowAnonymous]  // The invitation token itself authenticates the action; user must also be logged in.
    public async Task<ActionResult<MembershipResponse>> Accept(string orgId, string token, CancellationToken ct)
    {
        if (User?.Identity?.IsAuthenticated != true) return Unauthorized();
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        try
        {
            var inv = await _invitations.AcceptAsync(orgId, token, userId, ct);
            // Convert acceptance to a membership row.
            var existing = await _memberships.GetAsync(orgId, userId, ct);
            MembershipEntity m;
            if (existing is null)
                m = await _memberships.AddAsync(orgId, userId, inv.Role, MembershipStatus.Active, inv.InvitedByUserId, ct);
            else
            {
                existing.Role = inv.Role;
                existing.Status = MembershipStatus.Active;
                m = await _memberships.UpdateAsync(existing, ct);
            }
            await _audit.LogAsync(orgId, userId, AuditActions.MembershipAccept, "Invitation", token, ct: ct);
            return MembershipsController.Map(m);
        }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpDelete("{token}")]
    public async Task<IActionResult> Revoke(string orgId, string token, CancellationToken ct)
    {
        if (!RequireOrgAdmin(orgId, out var failure)) return failure!;
        await _invitations.RevokeAsync(orgId, token, ct);
        return NoContent();
    }

    private bool RequireOrgAdmin(string orgId, out ActionResult? failure)
    {
        failure = null;
        if (User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin)) return true;
        if (!_tenant.HasTenant || !string.Equals(_tenant.OrgId, orgId, StringComparison.Ordinal) ||
            !OrgRoles.OrgAdminOrAbove.Contains(_tenant.Role, StringComparer.Ordinal))
        { failure = Forbid(); return false; }
        return true;
    }

    private static InvitationResponse Map(InvitationEntity i) =>
        new(i.RowKey, i.OrgId, i.Email, i.Role, i.InvitedByUserId, i.CreatedAt, i.ExpiresAt, i.AcceptedByUserId, i.AcceptedAt);
}

// =============================================================================
//  /api/orgs/{orgId}/events
// =============================================================================

[ApiController]
[Route("api/orgs/{orgId}/events")]
[Authorize]
public class EventsController : ControllerBase
{
    private readonly IEventService _events;
    private readonly IMembershipService _memberships;
    private readonly IAuditService _audit;
    private readonly ITenantContext _tenant;

    public EventsController(IEventService events, IMembershipService memberships, IAuditService audit, ITenantContext tenant)
    {
        _events = events;
        _memberships = memberships;
        _audit = audit;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<EventResponse>>> List(string orgId, CancellationToken ct)
    {
        if (!RequireMember(orgId, out var failure)) return failure!;
        var list = await _events.ListForOrgAsync(orgId, ct);
        return Ok(list.Select(Map));
    }

    [HttpGet("{eventId}")]
    public async Task<ActionResult<EventResponse>> Get(string orgId, string eventId, CancellationToken ct)
    {
        if (!RequireMember(orgId, out var failure)) return failure!;
        var ev = await _events.GetAsync(orgId, eventId, ct);
        if (ev is null) return NotFound();
        return Map(ev);
    }

    [HttpPost]
    public async Task<ActionResult<EventResponse>> Create(string orgId, [FromBody] CreateEventRequest req, CancellationToken ct)
    {
        if (!RequireCanManage(orgId, out var failure)) return failure!;
        var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        try
        {
            var ev = await _events.CreateAsync(orgId, req.Name, req.Slug, actor, ct);
            await _audit.LogAsync(orgId, actor, AuditActions.EventCreate, "Event", ev.RowKey, new { ev.Name, ev.Slug }, ct: ct);
            return CreatedAtAction(nameof(Get), new { orgId, eventId = ev.RowKey }, Map(ev));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpPatch("{eventId}")]
    public async Task<ActionResult<EventResponse>> Update(string orgId, string eventId, [FromBody] UpdateEventRequest req, CancellationToken ct)
    {
        if (!RequireCanManage(orgId, out var failure)) return failure!;
        var ev = await _events.GetAsync(orgId, eventId, ct);
        if (ev is null) return NotFound();
        if (!string.IsNullOrWhiteSpace(req.Name)) ev.Name = req.Name.Trim();
        if (req.Description is not null) ev.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        if (req.StartsAt.HasValue) ev.StartsAt = req.StartsAt.Value;
        if (req.EndsAt.HasValue) ev.EndsAt = req.EndsAt.Value;
        if (req.Venue is not null) ev.Venue = string.IsNullOrWhiteSpace(req.Venue) ? null : req.Venue.Trim();
        var previousDefault = ev.DefaultActivityId;
        if (req.DefaultActivityId is not null) ev.DefaultActivityId = string.IsNullOrWhiteSpace(req.DefaultActivityId) ? null : req.DefaultActivityId.Trim();
        if (req.IsArchived.HasValue) ev.IsArchived = req.IsArchived.Value;
        await _events.UpdateAsync(ev, ct);
        // Keep ActivityEntity.IsDefault in sync with EventEntity.DefaultActivityId
        // so the legacy ActivitiesController + SPA continue to render the
        // "Default" badge without a per-request event lookup.
        if (req.DefaultActivityId is not null && !string.Equals(previousDefault, ev.DefaultActivityId, StringComparison.Ordinal))
        {
            await SyncActivityDefaultFlagAsync(previousDefault, ev.DefaultActivityId, ct);
        }
        var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        await _audit.LogAsync(orgId, actor, AuditActions.EventUpdate, "Event", eventId, req, ct: ct);
        return Map(ev);
    }

    private async Task SyncActivityDefaultFlagAsync(string? previousActivityId, string? newActivityId, CancellationToken ct)
    {
        var activities = HttpContext.RequestServices.GetService(typeof(IActivityService)) as IActivityService;
        if (activities is null) return;
        if (!string.IsNullOrWhiteSpace(previousActivityId))
        {
            var prev = await activities.GetAsync(previousActivityId, ct);
            if (prev is not null && prev.IsDefault)
            {
                prev.IsDefault = false;
                await activities.UpdateAsync(prev, ct);
            }
        }
        if (!string.IsNullOrWhiteSpace(newActivityId))
        {
            var next = await activities.GetAsync(newActivityId, ct);
            if (next is not null && !next.IsDefault)
            {
                next.IsDefault = true;
                await activities.UpdateAsync(next, ct);
            }
        }
    }

    [HttpDelete("{eventId}")]
    public async Task<IActionResult> Delete(string orgId, string eventId, CancellationToken ct)
    {
        if (!RequireOrgAdmin(orgId, out var failure)) return failure!;
        await _events.DeleteAsync(orgId, eventId, ct);
        var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "";
        await _audit.LogAsync(orgId, actor, AuditActions.EventDelete, "Event", eventId, ct: ct);
        return NoContent();
    }

    private bool RequireMember(string orgId, out ActionResult? failure)
    {
        failure = null;
        if (User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin)) return true;
        if (!_tenant.HasTenant || !string.Equals(_tenant.OrgId, orgId, StringComparison.Ordinal))
        { failure = Forbid(); return false; }
        return true;
    }

    private bool RequireCanManage(string orgId, out ActionResult? failure)
    {
        failure = null;
        if (User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin)) return true;
        if (!_tenant.HasTenant || !string.Equals(_tenant.OrgId, orgId, StringComparison.Ordinal) ||
            !OrgRoles.CanManageEvents.Contains(_tenant.Role, StringComparer.Ordinal))
        { failure = Forbid(); return false; }
        return true;
    }

    private bool RequireOrgAdmin(string orgId, out ActionResult? failure)
    {
        failure = null;
        if (User.IsInRole(Roles.Admin) || User.IsInRole(OrgRoles.PlatformAdmin)) return true;
        if (!_tenant.HasTenant || !string.Equals(_tenant.OrgId, orgId, StringComparison.Ordinal) ||
            !OrgRoles.OrgAdminOrAbove.Contains(_tenant.Role, StringComparer.Ordinal))
        { failure = Forbid(); return false; }
        return true;
    }

    internal static EventResponse Map(EventEntity e) =>
        new(e.RowKey, e.OrgId, e.Name, e.Slug, e.Description, e.StartsAt, e.EndsAt, e.Venue, e.DefaultActivityId, e.IsArchived);
}
