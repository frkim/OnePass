using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class EventServiceTests
{
    private static EventService Create() => new(new InMemoryTableStoreFactory());

    [Fact]
    public async Task Create_Persists_Event_With_Slug()
    {
        var svc = Create();
        var e = await svc.CreateAsync("org-1", "Devoxx Keynote", null, "user-1");
        Assert.Equal("org-1", e.OrgId);
        Assert.Equal("devoxx-keynote", e.Slug);
        Assert.Equal("user-1", e.CreatedByUserId);
    }

    [Fact]
    public async Task Create_Rejects_Duplicate_Slug_Within_Org()
    {
        var svc = Create();
        await svc.CreateAsync("org-1", "Keynote", "keynote", "u1");
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.CreateAsync("org-1", "Other", "keynote", "u1"));
    }

    [Fact]
    public async Task Same_Slug_Allowed_In_Different_Orgs()
    {
        var svc = Create();
        var a = await svc.CreateAsync("org-1", "Keynote", "keynote", "u1");
        var b = await svc.CreateAsync("org-2", "Keynote", "keynote", "u1");
        Assert.NotEqual(a.RowKey, b.RowKey);
    }

    [Fact]
    public async Task ListForOrg_Returns_Only_That_Org()
    {
        var svc = Create();
        await svc.CreateAsync("org-1", "A", "a", "u1");
        await svc.CreateAsync("org-2", "B", "b", "u1");
        await svc.CreateAsync("org-1", "C", "c", "u1");
        var list = await svc.ListForOrgAsync("org-1");
        Assert.Equal(2, list.Count);
        Assert.All(list, e => Assert.Equal("org-1", e.OrgId));
    }

    [Fact]
    public async Task GetBySlug_Roundtrip()
    {
        var svc = Create();
        var ev = await svc.CreateAsync("org-1", "Keynote", "keynote", "u1");
        var fetched = await svc.GetBySlugAsync("org-1", "keynote");
        Assert.NotNull(fetched);
        Assert.Equal(ev.RowKey, fetched!.RowKey);
        // Fetching from a different org returns nothing.
        Assert.Null(await svc.GetBySlugAsync("org-2", "keynote"));
    }
}
