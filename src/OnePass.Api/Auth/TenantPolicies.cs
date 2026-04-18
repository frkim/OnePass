using Microsoft.AspNetCore.Authorization;
using OnePass.Api.Models;

namespace OnePass.Api.Auth;

/// <summary>
/// Names of org-scoped authorization policies. Each policy expects the user
/// to be authenticated AND for <see cref="ITenantContext.Role"/> to be among
/// the allowed org roles. The legacy global <c>Roles.Admin</c> claim also
/// satisfies the admin policies for backward-compatibility during migration.
/// </summary>
public static class TenantPolicies
{
    public const string OrgMember = "OrgMember";
    public const string OrgAdmin = "OrgAdmin";
    public const string OrgOwner = "OrgOwner";
    public const string CanManageEvents = "CanManageEvents";
    public const string CanScan = "CanScan";
    public const string PlatformAdmin = "PlatformAdmin";
}

internal sealed class OrgRoleRequirement : IAuthorizationRequirement
{
    public IReadOnlyList<string> AllowedRoles { get; }
    /// <summary>If true, the legacy global <c>Admin</c> role also satisfies this requirement.</summary>
    public bool AcceptLegacyAdmin { get; }

    public OrgRoleRequirement(IReadOnlyList<string> allowedRoles, bool acceptLegacyAdmin)
    {
        AllowedRoles = allowedRoles;
        AcceptLegacyAdmin = acceptLegacyAdmin;
    }
}

internal sealed class OrgRoleHandler : AuthorizationHandler<OrgRoleRequirement>
{
    private readonly ITenantContext _tenant;
    public OrgRoleHandler(ITenantContext tenant) => _tenant = tenant;

    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, OrgRoleRequirement requirement)
    {
        if (context.User?.Identity?.IsAuthenticated != true)
            return Task.CompletedTask;

        if (requirement.AcceptLegacyAdmin && context.User.IsInRole(Roles.Admin))
        {
            context.Succeed(requirement);
            return Task.CompletedTask;
        }

        if (_tenant.HasTenant && requirement.AllowedRoles.Contains(_tenant.Role, StringComparer.Ordinal))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
