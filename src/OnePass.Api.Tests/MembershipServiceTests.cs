using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class MembershipServiceTests
{
    private static MembershipService Create() => new(new InMemoryTableStoreFactory());

    [Fact]
    public async Task Add_Then_Get_Returns_Membership()
    {
        var svc = Create();
        var m = await svc.AddAsync("org-1", "user-1", OrgRoles.OrgAdmin);
        Assert.Equal(OrgRoles.OrgAdmin, m.Role);
        Assert.Equal(MembershipStatus.Active, m.Status);
        var fetched = await svc.GetAsync("org-1", "user-1");
        Assert.NotNull(fetched);
        Assert.Equal("user-1", fetched!.UserId);
    }

    [Fact]
    public async Task Add_Rejects_Duplicate_Active_Membership()
    {
        var svc = Create();
        await svc.AddAsync("org-1", "user-1", OrgRoles.Scanner);
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.AddAsync("org-1", "user-1", OrgRoles.Scanner));
    }

    [Fact]
    public async Task Add_Allows_Re_Adding_After_Remove()
    {
        var svc = Create();
        await svc.AddAsync("org-1", "user-1", OrgRoles.Scanner);
        await svc.RemoveAsync("org-1", "user-1");
        var m = await svc.AddAsync("org-1", "user-1", OrgRoles.Viewer);
        Assert.Equal(OrgRoles.Viewer, m.Role);
    }

    [Fact]
    public async Task Add_Rejects_Unknown_Role()
    {
        var svc = Create();
        await Assert.ThrowsAsync<ArgumentException>(() => svc.AddAsync("org-1", "user-1", "Wizard"));
    }

    [Fact]
    public async Task ListForOrg_Excludes_Removed_Memberships()
    {
        var svc = Create();
        await svc.AddAsync("org-1", "user-a", OrgRoles.Scanner);
        await svc.AddAsync("org-1", "user-b", OrgRoles.Viewer);
        await svc.RemoveAsync("org-1", "user-b");
        var list = await svc.ListForOrgAsync("org-1");
        Assert.Single(list);
        Assert.Equal("user-a", list[0].UserId);
    }

    [Fact]
    public async Task ListForUser_Returns_All_Active_Orgs()
    {
        var svc = Create();
        await svc.AddAsync("org-1", "user-x", OrgRoles.OrgAdmin);
        await svc.AddAsync("org-2", "user-x", OrgRoles.Viewer);
        await svc.AddAsync("org-3", "user-x", OrgRoles.Scanner);
        await svc.RemoveAsync("org-2", "user-x");
        var list = await svc.ListForUserAsync("user-x");
        Assert.Equal(2, list.Count);
        Assert.DoesNotContain(list, x => x.OrgId == "org-2");
    }

    [Fact]
    public async Task Update_Persists_AllowedActivities_And_Default()
    {
        var svc = Create();
        var m = await svc.AddAsync("org-1", "user-1", OrgRoles.Scanner);
        m.AllowedActivityIds = new() { "a-1", "a-2" };
        m.DefaultActivityId = "a-1";
        m.Status = MembershipStatus.Disabled;
        await svc.UpdateAsync(m);
        var fetched = await svc.GetAsync("org-1", "user-1");
        Assert.NotNull(fetched);
        Assert.Equal(2, fetched!.AllowedActivityIds.Count);
        Assert.Equal("a-1", fetched.DefaultActivityId);
        Assert.Equal(MembershipStatus.Disabled, fetched.Status);
    }
}
