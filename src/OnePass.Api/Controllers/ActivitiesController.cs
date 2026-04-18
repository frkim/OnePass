using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnePass.Api.Dtos;
using OnePass.Api.Models;
using OnePass.Api.Services;

namespace OnePass.Api.Controllers;

[ApiController]
[Route("api/activities")]
[Authorize]
public class ActivitiesController : ControllerBase
{
    private readonly IActivityService _activities;
    private readonly IParticipantService _participants;
    private readonly IScanService _scans;
    private readonly ISettingsService _settings;
    private readonly Repositories.ITableStoreFactory _factory;

    public ActivitiesController(
        IActivityService activities,
        IParticipantService participants,
        IScanService scans,
        ISettingsService settings,
        Repositories.ITableStoreFactory factory)
    {
        _activities = activities;
        _participants = participants;
        _scans = scans;
        _settings = settings;
        _factory = factory;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ActivityResponse>>> List(CancellationToken ct)
    {
        var list = await _activities.ListAsync(ct);
        var settings = await _settings.GetAsync(ct);
        return Ok(list.Select(a => Map(a, settings.DefaultActivityId)));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ActivityResponse>> Get(string id, CancellationToken ct)
    {
        var a = await _activities.GetAsync(id, ct);
        if (a is null) return NotFound();
        var settings = await _settings.GetAsync(ct);
        return Map(a, settings.DefaultActivityId);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<ActivityResponse>> Create([FromBody] CreateActivityRequest req, CancellationToken ct)
    {
        try
        {
            var userId = User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub) ?? "";
            var entity = new ActivityEntity
            {
                Name = req.Name,
                Description = req.Description,
                StartsAt = req.StartsAt,
                EndsAt = req.EndsAt,
                MaxScansPerParticipant = req.MaxScansPerParticipant <= 0 ? -1 : req.MaxScansPerParticipant,
                CreatedByUserId = userId,
            };
            var created = await _activities.CreateAsync(entity, ct);
            var settings = await _settings.GetAsync(ct);
            return CreatedAtAction(nameof(Get), new { id = created.RowKey }, Map(created, settings.DefaultActivityId));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var existing = await _activities.ListAsync(ct);
        if (existing.Count <= 1)
            return Conflict(new { error = "At least one activity must always exist." });
        await DeleteActivityCascadeAsync(id, ct);
        // If the deleted activity was the global default, clear the setting.
        var settings = await _settings.GetAsync(ct);
        if (string.Equals(settings.DefaultActivityId, id, StringComparison.Ordinal))
            await _settings.UpdateAsync(null, "", ct);
        return NoContent();
    }

    /// <summary>Deletes all participants and scans for the activity (the activity itself is preserved).</summary>
    [HttpPost("{id}/reset")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> ResetScans(string id, CancellationToken ct)
    {
        var activity = await _activities.GetAsync(id, ct);
        if (activity is null) return NotFound();

        var scansRepo = _factory.GetRepository<ScanEntity>(ScanService.TableName);
        var partsRepo = _factory.GetRepository<ParticipantEntity>(ParticipantService.TableName);

        var deletedScans = 0;
        await foreach (var s in scansRepo.QueryAsync(null, ct))
        {
            if (s.PartitionKey == id)
            {
                await scansRepo.DeleteAsync(s.PartitionKey, s.RowKey, ct);
                deletedScans++;
            }
        }
        var deletedParticipants = 0;
        await foreach (var p in partsRepo.QueryAsync(null, ct))
        {
            if (p.PartitionKey == id)
            {
                await partsRepo.DeleteAsync(p.PartitionKey, p.RowKey, ct);
                deletedParticipants++;
            }
        }
        return Ok(new { participantsDeleted = deletedParticipants, scansDeleted = deletedScans });
    }

    private async Task DeleteActivityCascadeAsync(string id, CancellationToken ct)
    {
        var scansRepo = _factory.GetRepository<ScanEntity>(ScanService.TableName);
        var partsRepo = _factory.GetRepository<ParticipantEntity>(ParticipantService.TableName);
        await foreach (var s in scansRepo.QueryAsync(null, ct))
            if (s.PartitionKey == id) await scansRepo.DeleteAsync(s.PartitionKey, s.RowKey, ct);
        await foreach (var p in partsRepo.QueryAsync(null, ct))
            if (p.PartitionKey == id) await partsRepo.DeleteAsync(p.PartitionKey, p.RowKey, ct);
        await _activities.DeleteAsync(id, ct);
    }

    // ---- Participants ----

    [HttpGet("{id}/participants")]
    public async Task<ActionResult<IEnumerable<ParticipantResponse>>> ListParticipants(string id, CancellationToken ct)
    {
        var list = await _participants.ListForActivityAsync(id, ct);
        return Ok(list.Select(p => new ParticipantResponse(p.RowKey, p.PartitionKey, p.DisplayName, p.Email)));
    }

    [HttpPost("{id}/participants")]
    public async Task<ActionResult<ParticipantResponse>> AddParticipant(string id, [FromBody] CreateParticipantRequest req, CancellationToken ct)
    {
        try
        {
            var p = await _participants.CreateAsync(id, req.DisplayName, req.Email, ct);
            return Ok(new ParticipantResponse(p.RowKey, p.PartitionKey, p.DisplayName, p.Email));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    // ---- Scans ----

    [HttpPost("{id}/scans")]
    public async Task<ActionResult<ScanResponse>> Scan(string id, [FromBody] RecordScanRequest req, CancellationToken ct)
    {
        if (!string.Equals(req.ActivityId, id, StringComparison.Ordinal))
            return BadRequest(new { error = "Activity id in URL does not match body." });
        try
        {
            var userId = User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub) ?? "";
            var scan = await _scans.RecordScanAsync(id, req.ParticipantId, userId, ct);
            return Ok(new ScanResponse(scan.RowKey, scan.PartitionKey, scan.ParticipantId, scan.ScannedByUserId, scan.ScannedAt));
        }
        catch (DuplicateScanException ex)
        {
            return Conflict(new
            {
                code = "duplicate",
                error = "Participant has already been scanned for this activity.",
                previousScannedAt = ex.PreviousScannedAt,
            });
        }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpGet("{id}/scans")]
    public async Task<ActionResult<IEnumerable<ScanResponse>>> ListScans(string id, CancellationToken ct)
    {
        var scans = await _scans.ListForActivityAsync(id, ct: ct);
        return Ok(scans.Select(s => new ScanResponse(s.RowKey, s.PartitionKey, s.ParticipantId, s.ScannedByUserId, s.ScannedAt)));
    }

    // ---- Reporting & analytics ----

    [HttpGet("{id}/stats")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<ActivityStats>> Stats(string id, CancellationToken ct) =>
        await _scans.GetStatsAsync(id, ct);

    [HttpGet("{id}/report.csv")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> ReportCsv(string id, CancellationToken ct)
    {
        var scans = await _scans.ListForActivityAsync(id, includeArchived: true, ct: ct);
        var sb = new StringBuilder();
        sb.AppendLine("ScanId,ActivityId,ParticipantId,ScannedByUserId,ScannedAt,IsArchived");
        foreach (var s in scans.OrderByDescending(s => s.ScannedAt))
        {
            sb.Append(Csv(s.RowKey)).Append(',')
              .Append(Csv(s.PartitionKey)).Append(',')
              .Append(Csv(s.ParticipantId)).Append(',')
              .Append(Csv(s.ScannedByUserId)).Append(',')
              .Append(s.ScannedAt.ToString("O", CultureInfo.InvariantCulture)).Append(',')
              .Append(s.IsArchived)
              .AppendLine();
        }
        return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", $"activity-{id}-report.csv");
    }

    private static string Csv(string? v)
    {
        if (v is null) return "";
        var needsQuote = v.Contains(',') || v.Contains('"') || v.Contains('\n');
        return needsQuote ? $"\"{v.Replace("\"", "\"\"")}\"" : v;
    }

    private static ActivityResponse Map(ActivityEntity a, string? globalDefaultId) =>
        new(a.RowKey, a.Name, a.Description, a.StartsAt, a.EndsAt, a.MaxScansPerParticipant, a.IsActive,
            string.Equals(a.RowKey, globalDefaultId, StringComparison.Ordinal));
}
