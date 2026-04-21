using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnePass.Api.Auth;
using OnePass.Api.Dtos;
using OnePass.Api.Models;
using OnePass.Api.Services;

namespace OnePass.Api.Controllers;

/// <summary>
/// Per-user, cross-org "me" endpoints: profile defaults, GDPR export, and
/// right-to-erasure (Phase 6 compliance). Distinct from <c>/api/auth/me</c>
/// which only returns identity claims.
/// </summary>
[ApiController]
[Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly IUserService _users;
    private readonly IMembershipService _memberships;
    private readonly IAuditService _audit;

    public MeController(IUserService users, IMembershipService memberships, IAuditService audit)
    {
        _users = users;
        _memberships = memberships;
        _audit = audit;
    }

    /// <summary>
    /// GDPR data-subject access. Returns a JSON file containing every record
    /// we hold for the caller across every org they belong to. Audit events
    /// are sliced per-org so the file stays self-contained.
    /// </summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export(CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var user = await _users.GetByIdAsync(userId, ct);
        if (user is null) return NotFound();

        var ms = await _memberships.ListForUserAsync(userId, ct);
        var auditPerOrg = new List<object>();
        foreach (var m in ms)
        {
            var entries = await _audit.ListForOrgAsync(m.OrgId, max: 500, ct);
            foreach (var e in entries.Where(e => string.Equals(e.ActorUserId, userId, StringComparison.Ordinal)))
            {
                auditPerOrg.Add(new
                {
                    e.OrgId, e.Action, e.TargetType, e.TargetId, e.OccurredAt, e.UserAgent,
                });
            }
        }

        var payload = new MeExportResponse(
            User: new
            {
                user.RowKey, user.Email, user.Username, user.PreferredLanguage,
                user.Locale, user.CreatedAt, user.DefaultOrgId,
                ExternalIdentities = user.ExternalIdentities.Select(x => new { x.Provider, x.Email }).ToList(),
            },
            Memberships: ms.Select(m => (object)new
            {
                m.OrgId, m.Role, m.Status, m.JoinedAt,
                m.AllowedActivityIds, m.DefaultActivityId, m.DefaultEventId,
            }).ToList(),
            AuditEvents: auditPerOrg);

        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            WriteIndented = true,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        });
        return File(System.Text.Encoding.UTF8.GetBytes(json), "application/json",
            $"onepass-export-{userId}.json");
    }

    /// <summary>
    /// GDPR right-to-erasure. Removes every membership the user holds, then
    /// deletes the user row itself. Scans the user recorded are NOT deleted
    /// (operational records belonging to the org); they remain attributed to
    /// a <c>"deleted-user"</c> placeholder by way of the orphaned
    /// <c>ScannedByUserId</c> field. Last-owner rules apply to memberships.
    /// </summary>
    [HttpDelete]
    public async Task<IActionResult> DeleteMe(CancellationToken ct)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var me = await _users.GetByIdAsync(userId, ct);
        if (me is null) return NotFound();

        var ms = await _memberships.ListForUserAsync(userId, ct);

        // Last OrgOwner blocks deletion to avoid orphaning a tenant.
        foreach (var m in ms.Where(m => m.Role == OnePass.Api.Models.OrgRoles.OrgOwner))
        {
            var siblings = await _memberships.ListForOrgAsync(m.OrgId, ct);
            if (siblings.Count(s => s.Role == OnePass.Api.Models.OrgRoles.OrgOwner && s.UserId != userId) == 0)
                return Conflict(new { code = "last_owner", error = $"Transfer ownership of org '{m.OrgId}' before deleting your account." });
        }

        // Last Admin in an org blocks deletion.
        if (me.Role == OnePass.Api.Models.Roles.Admin)
        {
            foreach (var m in ms)
            {
                var orgMembers = await _memberships.ListForOrgAsync(m.OrgId, ct);
                var memberUserIds = orgMembers.Select(x => x.UserId).ToHashSet(StringComparer.Ordinal);
                var allUsers = await _users.ListAsync(ct);
                var otherAdmins = allUsers.Count(u => u.Role == OnePass.Api.Models.Roles.Admin && u.RowKey != userId && memberUserIds.Contains(u.RowKey));
                if (otherAdmins == 0)
                    return Conflict(new { code = "last_admin", error = $"Cannot delete your account — you are the last admin in organisation '{m.OrgId}'." });
            }
        }

        foreach (var m in ms)
        {
            await _memberships.RemoveAsync(m.OrgId, userId, ct);
            await _audit.LogAsync(m.OrgId, userId, AuditActions.UserSelfErase, "User", userId, ct: ct);
        }
        await _users.DeleteAsync(userId, ct);
        return NoContent();
    }
}
