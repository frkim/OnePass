using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnePass.Api.Auth;
using OnePass.Api.Models;
using OnePass.Api.Services;

namespace OnePass.Api.Controllers;

/// <summary>
/// Endpoints reserved for the global ("PlatformAdmin") administrator —
/// the OnePass operator running the SaaS service. Every action is gated
/// by <see cref="TenantPolicies.PlatformAdmin"/>, which also accepts the
/// legacy global <c>Admin</c> role so existing seed accounts keep working
/// during the migration to org-scoped roles.
/// </summary>
[ApiController]
[Route("api/admin/global")]
[Authorize(Policy = TenantPolicies.PlatformAdmin)]
public class GlobalAdminController : ControllerBase
{
    private readonly IPlatformSettingsService _settings;
    private readonly IOrganizationService _orgs;
    private readonly IUserService _users;
    private readonly IMembershipService _memberships;

    public GlobalAdminController(
        IPlatformSettingsService settings,
        IOrganizationService orgs,
        IUserService users,
        IMembershipService memberships)
    {
        _settings = settings;
        _orgs = orgs;
        _users = users;
        _memberships = memberships;
    }

    [HttpGet("stats")]
    public async Task<ActionResult<object>> Stats(CancellationToken ct)
    {
        var orgs = await _orgs.ListAsync(ct);
        var users = await _users.ListAsync(ct);
        return new
        {
            orgs = new
            {
                total = orgs.Count,
                active = orgs.Count(o => o.Status == OrganizationStatus.Active),
                suspended = orgs.Count(o => o.Status == OrganizationStatus.Suspended),
                deleted = orgs.Count(o => o.Status == OrganizationStatus.Deleted),
            },
            users = new
            {
                total = users.Count,
                active = users.Count(u => u.IsActive && !u.IsLocked),
                locked = users.Count(u => u.IsLocked),
                admins = users.Count(u => string.Equals(u.Role, Roles.Admin, StringComparison.Ordinal)),
            },
            generatedAt = DateTimeOffset.UtcNow,
        };
    }

    [HttpGet("orgs")]
    public async Task<ActionResult<IEnumerable<object>>> ListOrgs(CancellationToken ct)
    {
        var orgs = await _orgs.ListAsync(ct);
        var result = new List<object>(orgs.Count);
        foreach (var o in orgs.OrderBy(o => o.Name, StringComparer.OrdinalIgnoreCase))
        {
            var members = await _memberships.ListForOrgAsync(o.RowKey, ct);
            result.Add(new
            {
                id = o.RowKey,
                name = o.Name,
                slug = o.Slug,
                status = o.Status,
                plan = o.Plan,
                region = o.Region,
                ownerUserId = o.OwnerUserId,
                createdAt = o.CreatedAt,
                memberCount = members.Count,
                limits = o.Limits,
            });
        }
        return result;
    }

    public sealed record SetOrgStatusRequest(string Status);

    [HttpPost("orgs/{orgId}/status")]
    public async Task<ActionResult<object>> SetOrgStatus(string orgId, [FromBody] SetOrgStatusRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Status))
            return BadRequest(new { error = "Status is required." });
        if (!OrganizationStatus.IsValid(req.Status))
            return BadRequest(new { error = $"Invalid status. Allowed: {string.Join(", ", OrganizationStatus.All)}" });

        var org = await _orgs.GetAsync(orgId, ct);
        if (org is null) return NotFound();
        org.Status = req.Status;
        await _orgs.UpdateAsync(org, ct);
        return new { id = org.RowKey, status = org.Status };
    }

    [HttpGet("settings")]
    public async Task<ActionResult<PlatformSettingsEntity>> GetSettings(CancellationToken ct)
    {
        return await _settings.GetAsync(ct);
    }

    public sealed record UpdateSettingsRequest(
        bool? RegistrationOpen,
        string? MaintenanceMessage,
        int? DefaultRetentionDays,
        OrganizationLimits? DefaultOrgLimits);

    [HttpPut("settings")]
    public async Task<ActionResult<PlatformSettingsEntity>> UpdateSettings([FromBody] UpdateSettingsRequest req, CancellationToken ct)
    {
        if (req is null) return BadRequest(new { error = "Body is required." });
        var current = await _settings.GetAsync(ct);
        if (req.RegistrationOpen.HasValue) current.RegistrationOpen = req.RegistrationOpen.Value;
        if (req.MaintenanceMessage is not null)
        {
            // Treat blank string as "clear the banner".
            var trimmed = req.MaintenanceMessage.Trim();
            current.MaintenanceMessage = trimmed.Length == 0 ? null : trimmed;
        }
        if (req.DefaultRetentionDays.HasValue) current.DefaultRetentionDays = req.DefaultRetentionDays.Value;
        if (req.DefaultOrgLimits is not null) current.DefaultOrgLimits = req.DefaultOrgLimits;

        var actor = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return await _settings.UpdateAsync(current, actor, ct);
    }
}
