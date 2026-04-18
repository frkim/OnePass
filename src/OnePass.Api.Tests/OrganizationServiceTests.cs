using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class OrganizationServiceTests
{
    private static OrganizationService Create() => new(new InMemoryTableStoreFactory());

    [Fact]
    public async Task Create_Persists_Org_With_Normalised_Slug()
    {
        var svc = Create();
        var org = await svc.CreateAsync("Devoxx 2026", "Devoxx 2026!", "owner-id");
        Assert.Equal("devoxx-2026", org.Slug);
        Assert.Equal("Devoxx 2026", org.Name);
        Assert.Equal("owner-id", org.OwnerUserId);
        Assert.Equal(org.RowKey, org.PartitionKey);
        Assert.Equal(OrganizationStatus.Active, org.Status);
    }

    [Fact]
    public async Task GetBySlug_Roundtrip()
    {
        var svc = Create();
        var created = await svc.CreateAsync("Acme", "acme", "u1");
        var fetched = await svc.GetBySlugAsync("acme");
        Assert.NotNull(fetched);
        Assert.Equal(created.RowKey, fetched!.RowKey);
    }

    [Fact]
    public async Task Create_Rejects_Duplicate_Slug()
    {
        var svc = Create();
        await svc.CreateAsync("First", "shared", "u1");
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.CreateAsync("Second", "shared", "u2"));
    }

    [Theory]
    [InlineData("api")]
    [InlineData("admin")]
    [InlineData("orgs")]
    [InlineData("settings")]
    public async Task Create_Rejects_Reserved_Slug(string slug)
    {
        var svc = Create();
        await Assert.ThrowsAsync<ArgumentException>(() => svc.CreateAsync("X", slug, "u1"));
    }

    [Theory]
    [InlineData("-leading")]
    [InlineData("trailing-")]
    [InlineData("UPPER")]
    [InlineData("with spaces")]
    [InlineData("with_underscore")]
    [InlineData("")]
    public void EnsureValidSlug_Rejects_Invalid(string raw)
    {
        Assert.Throws<ArgumentException>(() => OrganizationService.EnsureValidSlug(raw));
    }

    [Theory]
    [InlineData("UPPER", "upper")]
    [InlineData("with spaces", "with-spaces")]
    [InlineData("-leading-", "leading")]
    [InlineData("a--b", "a-b")]
    [InlineData("Devoxx 2026!", "devoxx-2026")]
    public void NormaliseSlug_Cleans_Input(string raw, string expected)
    {
        Assert.Equal(expected, OrganizationService.NormaliseSlug(raw));
    }

    [Fact]
    public async Task RenameSlug_Records_PreviousSlug_For_Redirect()
    {
        var svc = Create();
        var org = await svc.CreateAsync("Acme", "old-slug", "u1");
        var renamed = await svc.RenameSlugAsync(org.RowKey, "new-slug");
        Assert.Equal("new-slug", renamed.Slug);
        Assert.Equal("old-slug", renamed.PreviousSlug);
        // Old slug still resolves (for the 301 redirect at the edge).
        var byOldSlug = await svc.GetBySlugAsync("old-slug");
        Assert.NotNull(byOldSlug);
        Assert.Equal(org.RowKey, byOldSlug!.RowKey);
    }

    [Fact]
    public async Task RenameSlug_Rejects_Collision()
    {
        var svc = Create();
        var a = await svc.CreateAsync("A", "alpha", "u1");
        await svc.CreateAsync("B", "beta", "u2");
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.RenameSlugAsync(a.RowKey, "beta"));
    }

    [Fact]
    public async Task SoftDelete_Sets_Status_Without_Removing_Row()
    {
        var svc = Create();
        var org = await svc.CreateAsync("Acme", "acme", "u1");
        await svc.SoftDeleteAsync(org.RowKey);
        var refreshed = await svc.GetAsync(org.RowKey);
        Assert.NotNull(refreshed);
        Assert.Equal(OrganizationStatus.Deleted, refreshed!.Status);
    }
}
