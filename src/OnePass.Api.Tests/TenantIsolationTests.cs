using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

/// <summary>
/// End-to-end tenant-isolation contract tests at the service layer. These
/// exercise the same code paths that controllers use and verify that two
/// orgs cannot read or modify each other's data.
/// </summary>
public class TenantIsolationTests
{
    private record Stack(
        InMemoryTableStoreFactory Store,
        OrganizationService Orgs,
        MembershipService Memberships,
        EventService Events,
        InvitationService Invitations,
        AuditService Audit);

    private static Stack Build()
    {
        var store = new InMemoryTableStoreFactory();
        return new(store, new OrganizationService(store), new MembershipService(store),
                   new EventService(store), new InvitationService(store), new AuditService(store));
    }

    [Fact]
    public async Task Orgs_Are_Isolated_By_PartitionKey()
    {
        var s = Build();
        var orgA = await s.Orgs.CreateAsync("Acme", "acme", "alice");
        var orgB = await s.Orgs.CreateAsync("Beta", "beta", "bob");
        Assert.NotEqual(orgA.RowKey, orgB.RowKey);
        Assert.Equal(orgA.RowKey, orgA.PartitionKey);
        Assert.Equal(orgB.RowKey, orgB.PartitionKey);
        Assert.NotEqual(orgA.PartitionKey, orgB.PartitionKey);
    }

    [Fact]
    public async Task Memberships_In_Org_A_Do_Not_Leak_Into_Org_B()
    {
        var s = Build();
        await s.Memberships.AddAsync("org-a", "alice", OrgRoles.OrgOwner);
        await s.Memberships.AddAsync("org-a", "bob", OrgRoles.Viewer);
        await s.Memberships.AddAsync("org-b", "carol", OrgRoles.Scanner);

        var aMembers = await s.Memberships.ListForOrgAsync("org-a");
        var bMembers = await s.Memberships.ListForOrgAsync("org-b");
        Assert.Equal(2, aMembers.Count);
        Assert.Single(bMembers);
        Assert.DoesNotContain(aMembers, m => m.UserId == "carol");
        Assert.DoesNotContain(bMembers, m => m.UserId == "alice" || m.UserId == "bob");
    }

    [Fact]
    public async Task Events_Are_Scoped_To_Their_Organisation()
    {
        var s = Build();
        await s.Events.CreateAsync("org-a", "Keynote A", "keynote", "alice");
        await s.Events.CreateAsync("org-b", "Keynote B", "keynote", "bob");

        var aEvents = await s.Events.ListForOrgAsync("org-a");
        var bEvents = await s.Events.ListForOrgAsync("org-b");
        Assert.Single(aEvents);
        Assert.Single(bEvents);
        Assert.Equal("Keynote A", aEvents[0].Name);
        Assert.Equal("Keynote B", bEvents[0].Name);

        // Cross-org Get returns null even when the event id is known.
        var aEventId = aEvents[0].RowKey;
        Assert.Null(await s.Events.GetAsync("org-b", aEventId));
        Assert.NotNull(await s.Events.GetAsync("org-a", aEventId));
    }

    [Fact]
    public async Task Invitations_Are_Scoped_To_Their_Organisation()
    {
        var s = Build();
        var invA = await s.Invitations.CreateAsync("org-a", "x@y.com", OrgRoles.Viewer, "alice");
        await s.Invitations.CreateAsync("org-b", "y@z.com", OrgRoles.Viewer, "bob");

        var aList = await s.Invitations.ListForOrgAsync("org-a");
        var bList = await s.Invitations.ListForOrgAsync("org-b");
        Assert.Single(aList);
        Assert.Single(bList);

        // Direct read with the wrong org id misses.
        Assert.Null(await s.Invitations.GetAsync("org-b", invA.RowKey));
        Assert.NotNull(await s.Invitations.GetAsync("org-a", invA.RowKey));
    }

    [Fact]
    public async Task Audit_Events_Are_Scoped_To_Their_Organisation()
    {
        var s = Build();
        await s.Audit.LogAsync("org-a", "alice", AuditActions.MembershipUpdate, "Membership", "bob");
        await s.Audit.LogAsync("org-a", "alice", AuditActions.EventCreate, "Event", "ev-1");
        await s.Audit.LogAsync("org-b", "bob", AuditActions.MembershipUpdate, "Membership", "alice");

        Assert.Equal(2, (await s.Audit.ListForOrgAsync("org-a")).Count);
        Assert.Single(await s.Audit.ListForOrgAsync("org-b"));
    }

    [Fact]
    public async Task User_Membership_Listing_Spans_Orgs_For_Same_User_Only()
    {
        var s = Build();
        await s.Memberships.AddAsync("org-a", "shared", OrgRoles.OrgAdmin);
        await s.Memberships.AddAsync("org-b", "shared", OrgRoles.Scanner);
        await s.Memberships.AddAsync("org-c", "other", OrgRoles.Viewer);

        var sharedMemberships = await s.Memberships.ListForUserAsync("shared");
        Assert.Equal(2, sharedMemberships.Count);
        Assert.Contains(sharedMemberships, m => m.OrgId == "org-a" && m.Role == OrgRoles.OrgAdmin);
        Assert.Contains(sharedMemberships, m => m.OrgId == "org-b" && m.Role == OrgRoles.Scanner);
        Assert.DoesNotContain(sharedMemberships, m => m.UserId == "other");
    }

    [Fact]
    public async Task Disabled_Membership_In_One_Org_Does_Not_Affect_Others()
    {
        var s = Build();
        var mA = await s.Memberships.AddAsync("org-a", "shared", OrgRoles.Scanner);
        await s.Memberships.AddAsync("org-b", "shared", OrgRoles.Scanner);
        mA.Status = MembershipStatus.Disabled;
        await s.Memberships.UpdateAsync(mA);

        var disabledHere = await s.Memberships.GetAsync("org-a", "shared");
        var stillActiveThere = await s.Memberships.GetAsync("org-b", "shared");
        Assert.NotNull(disabledHere);
        Assert.NotNull(stillActiveThere);
        Assert.Equal(MembershipStatus.Disabled, disabledHere!.Status);
        Assert.Equal(MembershipStatus.Active, stillActiveThere!.Status);
    }

    [Fact]
    public async Task Invitation_Accept_Cannot_Be_Replayed_Across_Orgs()
    {
        var s = Build();
        var inv = await s.Invitations.CreateAsync("org-a", "x@y.com", OrgRoles.Viewer, "alice");
        // Wrong org id refuses to find / accept the invitation.
        await Assert.ThrowsAsync<InvalidOperationException>(() => s.Invitations.AcceptAsync("org-b", inv.RowKey, "joe"));
    }

    [Fact]
    public async Task Slug_Lookup_Falls_Back_To_PreviousSlug_For_Redirect()
    {
        var s = Build();
        var org = await s.Orgs.CreateAsync("Acme", "acme", "alice");
        await s.Orgs.RenameSlugAsync(org.RowKey, "acme-corp");
        var byNew = await s.Orgs.GetBySlugAsync("acme-corp");
        var byOld = await s.Orgs.GetBySlugAsync("acme");
        Assert.NotNull(byNew);
        Assert.NotNull(byOld);
        Assert.Equal(org.RowKey, byNew!.RowKey);
        Assert.Equal(org.RowKey, byOld!.RowKey);
    }
}
