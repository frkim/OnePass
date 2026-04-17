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
    private readonly ILogger<AdminController> _logger;

    public AdminController(ITableStoreFactory factory, ILogger<AdminController> logger)
    {
        _factory = factory;
        _logger = logger;
    }

    /// <summary>
    /// Removes ALL activities, participants, and scans. Users are preserved.
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

        _logger.LogWarning(
            "Admin reset by {User}: deleted {Activities} activities, {Participants} participants, {Scans} scans.",
            User.Identity?.Name, deletedActivities, deletedParticipants, deletedScans);

        return Ok(new
        {
            activitiesDeleted = deletedActivities,
            participantsDeleted = deletedParticipants,
            scansDeleted = deletedScans,
        });
    }

    private static async Task<int> DeleteAllAsync<T>(ITableRepository<T> repo, CancellationToken ct)
        where T : class, Azure.Data.Tables.ITableEntity, new()
    {
        var keys = new List<(string pk, string rk)>();
        await foreach (var e in repo.QueryAsync(null, ct))
            keys.Add((e.PartitionKey, e.RowKey));
        foreach (var (pk, rk) in keys)
            await repo.DeleteAsync(pk, rk, ct);
        return keys.Count;
    }
}
