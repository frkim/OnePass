using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using OnePass.Api.Models;
using OnePass.Api.Services;

namespace OnePass.Api.Auth;

/// <summary>
/// Resolves the active organisation for the current authenticated user.
/// Source of truth (in order):
///   1. <c>X-OnePass-Org</c> header — explicit org switch from the SPA
///   2. <c>org_id</c> claim on the JWT — set by CIAM token enrichment (Phase 2)
///   3. The user's <see cref="UserEntity.DefaultOrgId"/>
///   4. The user's first <see cref="MembershipStatus.Active"/> membership
///
/// If the candidate org doesn't correspond to an active membership, the
/// request continues anonymously (no tenant scope) — controllers that
/// require a tenant must enforce that themselves.
/// </summary>
public sealed class TenantContextMiddleware
{
    public const string OrgHeader = "X-OnePass-Org";
    private readonly RequestDelegate _next;

    public TenantContextMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext ctx,
        ITenantContext tenant,
        IOrganizationService orgs,
        IMembershipService memberships,
        IUserService users)
    {
        if (ctx.User?.Identity?.IsAuthenticated == true)
        {
            var userId = ctx.User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                         ?? ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrWhiteSpace(userId))
            {
                var headerOrg = ctx.Request.Headers[OrgHeader].ToString();
                var claimOrg = ctx.User.FindFirstValue("org_id");
                string? candidate = !string.IsNullOrWhiteSpace(headerOrg) ? headerOrg
                                  : !string.IsNullOrWhiteSpace(claimOrg) ? claimOrg
                                  : null;

                if (candidate is null)
                {
                    var user = await users.GetByIdAsync(userId);
                    candidate = user?.DefaultOrgId;
                }

                MembershipEntity? membership = null;
                OrganizationEntity? org = null;
                if (!string.IsNullOrWhiteSpace(candidate))
                {
                    membership = await memberships.GetAsync(candidate, userId);
                    if (membership is not null && membership.Status == MembershipStatus.Active)
                        org = await orgs.GetAsync(candidate);
                }

                if (org is null || membership is null || membership.Status != MembershipStatus.Active ||
                    org.Status != OrganizationStatus.Active)
                {
                    // Fall back to the user's first active membership so the SPA
                    // can render *something* before the user picks an org.
                    var all = await memberships.ListForUserAsync(userId);
                    foreach (var m in all)
                    {
                        if (m.Status != MembershipStatus.Active) continue;
                        var o = await orgs.GetAsync(m.OrgId);
                        if (o is not null && o.Status == OrganizationStatus.Active)
                        {
                            membership = m;
                            org = o;
                            break;
                        }
                    }
                }

                if (org is not null && membership is not null)
                    tenant.Set(org, membership);
            }
        }

        await _next(ctx);
    }
}
