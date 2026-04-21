namespace OnePass.Api.Models;

/// <summary>
/// Built-in roles. Additional custom roles (e.g. EventCoordinator, Supervisor)
/// can be added here as the application scales.
/// </summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string GlobalAdmin = "GlobalAdmin";
    public const string User = "User";

    public static readonly string[] All = { Admin, GlobalAdmin, User };
}
