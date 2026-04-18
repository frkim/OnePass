using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class SettingsServiceTests
{
    private static SettingsService CreateService() => new(new InMemoryTableStoreFactory());

    [Fact]
    public async Task Get_Returns_Defaults_On_First_Call()
    {
        var svc = CreateService();
        var s = await svc.GetAsync();
        Assert.Equal(string.Empty, s.EventName);
        Assert.Null(s.DefaultActivityId);
    }

    [Fact]
    public async Task Update_EventName_And_DefaultActivity_Persists()
    {
        var svc = CreateService();
        await svc.UpdateAsync("Devoxx 2026", "act-1");
        var s = await svc.GetAsync();
        Assert.Equal("Devoxx 2026", s.EventName);
        Assert.Equal("act-1", s.DefaultActivityId);
    }

    [Fact]
    public async Task Update_With_Null_EventName_Leaves_It_Unchanged()
    {
        var svc = CreateService();
        await svc.UpdateAsync("Initial", "act-1");
        await svc.UpdateAsync(null, "act-2");
        var s = await svc.GetAsync();
        Assert.Equal("Initial", s.EventName);
        Assert.Equal("act-2", s.DefaultActivityId);
    }

    [Fact]
    public async Task Update_With_Empty_DefaultActivity_Clears_It()
    {
        var svc = CreateService();
        await svc.UpdateAsync("Event", "act-1");
        await svc.UpdateAsync(null, "");
        var s = await svc.GetAsync();
        Assert.Null(s.DefaultActivityId);
    }
}
