using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = Roles.Admin)]
public class AdminController : ControllerBase
{
    private readonly ITableStoreFactory _factory;
    private readonly IActivityService _activities;
    private readonly ISettingsService _settings;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        ITableStoreFactory factory,
        IActivityService activities,
        ISettingsService settings,
        ILogger<AdminController> logger)
    {
        _factory = factory;
        _activities = activities;
        _settings = settings;
        _logger = logger;
    }

    /// <summary>
    /// Removes ALL activities, participants, and scans. Users are preserved.
    /// A new empty default activity is recreated so the system always has at
    /// least one activity available.
    /// </summary>
    [HttpPost("reset")]
    public async Task<IActionResult> Reset(CancellationToken ct)
    {
        var activitiesRepo = _factory.GetRepository<ActivityEntity>(ActivityService.TableName);
        var participantsRepo = _factory.GetRepository<ParticipantEntity>(ParticipantService.TableName);
        var scansRepo = _factory.GetRepository<ScanEntity>(ScanService.TableName);

        var deletedActivities = await DeleteAllAsync(activitiesRepo, ct);
        var deletedParticipants = await DeleteAllAsync(participantsRepo, ct);
        var deletedScans = await DeleteAllAsync(scansRepo, ct);

        // Recreate an empty default activity so the system always has at least one.
        var now = DateTimeOffset.UtcNow;
        var userId = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value ?? "";
        var seeded = await _activities.CreateAsync(new ActivityEntity
        {
            Name = "default",
            Description = "Default activity",
            StartsAt = now.AddDays(-1),
            EndsAt = now.AddMonths(1),
            MaxScansPerParticipant = -1,
            CreatedByUserId = userId,
            IsActive = true,
        }, ct);
        await _settings.UpdateAsync(null, seeded.RowKey, ct);

        _logger.LogWarning(
            "Admin reset by {User}: deleted {Activities} activities, {Participants} participants, {Scans} scans.",
            User.Identity?.Name, deletedActivities, deletedParticipants, deletedScans);

        return Ok(new
        {
            activitiesDeleted = deletedActivities,
            participantsDeleted = deletedParticipants,
            scansDeleted = deletedScans,
            defaultActivityId = seeded.RowKey,
        });
    }

    private static async Task<int> DeleteAllAsync<T>(ITableRepository<T> repo, CancellationToken ct)
        where T : class, OnePass.Api.Models.IEntity, new()
    {
        var keys = new List<(string pk, string rk)>();
        await foreach (var e in repo.QueryAsync(null, ct))
            keys.Add((e.PartitionKey, e.RowKey));
        foreach (var (pk, rk) in keys)
            await repo.DeleteAsync(pk, rk, ct);
        return keys.Count;
    }
}
