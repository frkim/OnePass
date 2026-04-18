using OnePass.Api.Models;

namespace OnePass.Api.Auth;

/// <summary>
/// Per-request tenant scope. Resolved by <see cref="TenantContextMiddleware"/>
/// from the <c>X-OnePass-Org</c> header (org id) or the user's
/// <see cref="UserEntity.DefaultOrgId"/>. Anonymous requests have an empty
/// context.
/// </summary>
public interface ITenantContext
{
    /// <summary>True if a tenant scope has been resolved for this request.</summary>
    bool HasTenant { get; }

    /// <summary>Currently active organisation id, or empty string if none.</summary>
    string OrgId { get; }

    /// <summary>The current user's role inside <see cref="OrgId"/>, or empty.</summary>
    string Role { get; }

    /// <summary>Membership row backing this scope, if any.</summary>
    MembershipEntity? Membership { get; }

    /// <summary>Organisation row backing this scope, if any.</summary>
    OrganizationEntity? Organization { get; }

    void Set(OrganizationEntity org, MembershipEntity membership);
}

internal sealed class TenantContext : ITenantContext
{
    public bool HasTenant => !string.IsNullOrEmpty(OrgId);
    public string OrgId { get; private set; } = string.Empty;
    public string Role { get; private set; } = string.Empty;
    public MembershipEntity? Membership { get; private set; }
    public OrganizationEntity? Organization { get; private set; }

    public void Set(OrganizationEntity org, MembershipEntity membership)
    {
        Organization = org;
        Membership = membership;
        OrgId = org.RowKey;
        Role = membership.Role;
    }
}
