using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class ActivityServiceRenameTests
{
    private static ActivityService NewService() => new(new InMemoryTableStoreFactory());

    private static Task<ActivityEntity> SeedAsync(ActivityService svc, string name) =>
        svc.CreateAsync(new ActivityEntity
        {
            Name = name,
            StartsAt = DateTimeOffset.UtcNow,
            EndsAt = DateTimeOffset.UtcNow.AddHours(1),
            MaxScansPerParticipant = -1,
        });

    [Fact]
    public async Task Rename_Updates_Name_And_Preserves_Id()
    {
        var svc = NewService();
        var a = await SeedAsync(svc, "Old");

        var renamed = await svc.RenameAsync(a.RowKey, "  New Name  ");

        Assert.Equal(a.RowKey, renamed.RowKey);
        Assert.Equal("New Name", renamed.Name);
        var fetched = await svc.GetAsync(a.RowKey);
        Assert.NotNull(fetched);
        Assert.Equal("New Name", fetched!.Name);
    }

    [Fact]
    public async Task Rename_To_Same_Name_Is_Noop()
    {
        var svc = NewService();
        var a = await SeedAsync(svc, "Keynote");

        var result = await svc.RenameAsync(a.RowKey, "Keynote");

        Assert.Equal("Keynote", result.Name);
    }

    [Fact]
    public async Task Rename_To_Existing_Name_Throws_Conflict()
    {
        var svc = NewService();
        await SeedAsync(svc, "Alpha");
        var b = await SeedAsync(svc, "Beta");

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.RenameAsync(b.RowKey, "alpha"));
    }

    [Fact]
    public async Task Rename_Empty_Name_Throws()
    {
        var svc = NewService();
        var a = await SeedAsync(svc, "X");

        await Assert.ThrowsAsync<ArgumentException>(() =>
            svc.RenameAsync(a.RowKey, "   "));
    }

    [Fact]
    public async Task Rename_Unknown_Id_Throws_NotFound()
    {
        var svc = NewService();
        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            svc.RenameAsync("does-not-exist", "Whatever"));
    }
}
