using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class UserServiceTests
{
    private static UserService CreateService() => new(new InMemoryTableStoreFactory());

    [Fact]
    public async Task Create_Then_Login_By_Email_Succeeds()
    {
        var svc = CreateService();
        var user = await svc.CreateAsync("Alice@Example.com", "alice", "SuperSecret1!", Roles.Admin);
        Assert.Equal("alice@example.com", user.Email);
        Assert.Equal(Roles.Admin, user.Role);

        var byEmail = await svc.FindByEmailOrUsernameAsync("alice@example.com");
        Assert.NotNull(byEmail);
        Assert.True(svc.VerifyPassword(byEmail!, "SuperSecret1!"));
        Assert.False(svc.VerifyPassword(byEmail!, "wrong"));
    }

    [Fact]
    public async Task Duplicate_Email_Is_Rejected()
    {
        var svc = CreateService();
        await svc.CreateAsync("dup@example.com", "dup", "SuperSecret1!", Roles.User);
        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
            await svc.CreateAsync("dup@example.com", "dup2", "SuperSecret1!", Roles.User));
    }

    [Fact]
    public async Task Short_Password_Is_Rejected()
    {
        var svc = CreateService();
        await Assert.ThrowsAsync<ArgumentException>(async () =>
            await svc.CreateAsync("short@example.com", "short", "abc", Roles.User));
    }

    [Fact]
    public async Task Unknown_Role_Is_Rejected()
    {
        var svc = CreateService();
        await Assert.ThrowsAsync<ArgumentException>(async () =>
            await svc.CreateAsync("r@example.com", "r", "SuperSecret1!", "Superman"));
    }
}
