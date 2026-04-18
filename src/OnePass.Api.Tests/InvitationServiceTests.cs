using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class InvitationServiceTests
{
    private static InvitationService Create() => new(new InMemoryTableStoreFactory());

    [Fact]
    public async Task Create_Generates_Token_And_Persists()
    {
        var svc = Create();
        var inv = await svc.CreateAsync("org-1", "User@Example.COM", OrgRoles.Scanner, "inviter-id");
        Assert.False(string.IsNullOrEmpty(inv.RowKey));
        Assert.Equal("user@example.com", inv.Email);
        Assert.Equal(OrgRoles.Scanner, inv.Role);
        Assert.True(inv.ExpiresAt > DateTimeOffset.UtcNow);
        Assert.Null(inv.AcceptedByUserId);
    }

    [Fact]
    public async Task Create_Rejects_Unknown_Role()
    {
        var svc = Create();
        await Assert.ThrowsAsync<ArgumentException>(() => svc.CreateAsync("org-1", "x@y.z", "Wizard", "inviter"));
    }

    [Fact]
    public async Task Accept_Marks_Invitation_Used_Once()
    {
        var svc = Create();
        var inv = await svc.CreateAsync("org-1", "user@x.com", OrgRoles.Viewer, "inviter");
        var accepted = await svc.AcceptAsync("org-1", inv.RowKey, "joe");
        Assert.Equal("joe", accepted.AcceptedByUserId);
        Assert.NotNull(accepted.AcceptedAt);

        // Double-accept is rejected.
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.AcceptAsync("org-1", inv.RowKey, "someone-else"));
    }

    [Fact]
    public async Task Accept_Rejects_Expired_Invitation()
    {
        var svc = Create();
        var inv = await svc.CreateAsync("org-1", "user@x.com", OrgRoles.Viewer, "inviter", ttl: TimeSpan.FromMilliseconds(1));
        await Task.Delay(10);
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.AcceptAsync("org-1", inv.RowKey, "joe"));
    }

    [Fact]
    public async Task Accept_Rejects_Unknown_Token()
    {
        var svc = Create();
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.AcceptAsync("org-1", "no-such-token", "joe"));
    }

    [Fact]
    public async Task ListForOrg_Filters_Tenants()
    {
        var svc = Create();
        await svc.CreateAsync("org-1", "a@x.com", OrgRoles.Viewer, "inviter");
        await svc.CreateAsync("org-1", "b@x.com", OrgRoles.Viewer, "inviter");
        await svc.CreateAsync("org-2", "c@x.com", OrgRoles.Viewer, "inviter");
        var list = await svc.ListForOrgAsync("org-1");
        Assert.Equal(2, list.Count);
        Assert.All(list, i => Assert.Equal("org-1", i.OrgId));
    }
}
