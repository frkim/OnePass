namespace OnePass.Api.Models;

/// <summary>
/// Org-scoped roles for the SaaS multi-tenant model. Replaces the legacy
/// global <see cref="Roles"/> over time. <see cref="PlatformAdmin"/> is the
/// only platform-wide role and is reserved for OnePass operators.
/// </summary>
public static class OrgRoles
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string OrgOwner = "OrgOwner";
    public const string OrgAdmin = "OrgAdmin";
    public const string EventCoordinator = "EventCoordinator";
    public const string Scanner = "Scanner";
    public const string Viewer = "Viewer";

    public static readonly string[] All =
    {
        PlatformAdmin, OrgOwner, OrgAdmin, EventCoordinator, Scanner, Viewer,
    };

    /// <summary>
    /// Roles that may administer an organisation (members, events, settings,
    /// destructive resets). <see cref="PlatformAdmin"/> is intentionally
    /// excluded — operators escalate explicitly via dedicated platform tools.
    /// </summary>
    public static readonly string[] OrgAdminOrAbove = { OrgOwner, OrgAdmin };

    /// <summary>
    /// Roles permitted to manage events / activities inside the org.
    /// </summary>
    public static readonly string[] CanManageEvents = { OrgOwner, OrgAdmin, EventCoordinator };

    /// <summary>
    /// Roles permitted to record scans.
    /// </summary>
    public static readonly string[] CanScan = { OrgOwner, OrgAdmin, EventCoordinator, Scanner };

    public static bool IsValid(string role) => Array.IndexOf(All, role) >= 0;
}

/// <summary>Status of an org membership; used to enable/disable per-org access.</summary>
public static class MembershipStatus
{
    public const string Pending = "Pending";
    public const string Active = "Active";
    public const string Disabled = "Disabled";
    public const string Removed = "Removed";

    public static readonly string[] All = { Pending, Active, Disabled, Removed };
    public static bool IsValid(string status) => Array.IndexOf(All, status) >= 0;
}

/// <summary>Status of an organization; supports soft-delete and suspension.</summary>
public static class OrganizationStatus
{
    public const string Active = "Active";
    public const string Suspended = "Suspended";
    public const string Deleted = "Deleted";

    public static readonly string[] All = { Active, Suspended, Deleted };
    public static bool IsValid(string status) => Array.IndexOf(All, status) >= 0;
}
