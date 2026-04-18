using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class AuditServiceTests
{
    private static AuditService Create() => new(new InMemoryTableStoreFactory());

    [Fact]
    public async Task Log_Persists_Entry_With_Metadata()
    {
        var svc = Create();
        await svc.LogAsync("org-1", "actor-1", AuditActions.MembershipUpdate, "Membership", "user-2",
            new { newRole = OrgRoles.OrgAdmin });
        var entries = await svc.ListForOrgAsync("org-1");
        Assert.Single(entries);
        var e = entries[0];
        Assert.Equal("actor-1", e.ActorUserId);
        Assert.Equal("Membership", e.TargetType);
        Assert.Equal("user-2", e.TargetId);
        Assert.NotNull(e.Metadata);
        Assert.Contains("OrgAdmin", e.Metadata);
    }

    [Fact]
    public async Task Log_With_Empty_Org_Is_NoOp()
    {
        var svc = Create();
        await svc.LogAsync("", "actor", "x.y", "T", "id");
        var entries = await svc.ListForOrgAsync("");
        Assert.Empty(entries);
    }

    [Fact]
    public async Task Log_Hashes_Ip_Address()
    {
        var svc = Create();
        await svc.LogAsync("org-1", "actor", "x.y", "T", "id", null, "192.0.2.1", "ua");
        var entries = await svc.ListForOrgAsync("org-1");
        Assert.Single(entries);
        var e = entries[0];
        Assert.NotNull(e.IpHash);
        Assert.NotEqual("192.0.2.1", e.IpHash);
        Assert.Equal(64, e.IpHash!.Length); // SHA-256 hex
    }

    [Fact]
    public async Task ListForOrg_Returns_Newest_First_And_Filters_Tenants()
    {
        var svc = Create();
        await svc.LogAsync("org-1", "u", "a.b", "T", "1");
        await Task.Delay(5);
        await svc.LogAsync("org-1", "u", "a.b", "T", "2");
        await svc.LogAsync("org-2", "u", "a.b", "T", "3");
        var list = await svc.ListForOrgAsync("org-1");
        Assert.Equal(2, list.Count);
        Assert.Equal("2", list[0].TargetId);
        Assert.Equal("1", list[1].TargetId);
    }
}
