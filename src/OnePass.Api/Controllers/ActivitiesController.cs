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
    private readonly Repositories.ITableStoreFactory _factory;

    public ActivitiesController(
        IActivityService activities,
        IParticipantService participants,
        IScanService scans,
        Repositories.ITableStoreFactory factory)
    {
        _activities = activities;
        _participants = participants;
        _scans = scans;
        _factory = factory;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ActivityResponse>>> List(CancellationToken ct)
    {
        var list = await _activities.ListAsync(ct);
        return Ok(list.Select(Map));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ActivityResponse>> Get(string id, CancellationToken ct)
    {
        var a = await _activities.GetAsync(id, ct);
        if (a is null) return NotFound();
        return Map(a);
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
            return CreatedAtAction(nameof(Get), new { id = created.RowKey }, Map(created));
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
        return NoContent();
    }

    /// <summary>Partially updates an existing activity. Admin-only.</summary>
    [HttpPatch("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<ActivityResponse>> Update(string id, [FromBody] UpdateActivityRequest req, CancellationToken ct)
    {
        if (req.Name is null && req.Description is null && req.StartsAt is null && req.EndsAt is null && req.MaxScansPerParticipant is null)
            return BadRequest(new { error = "No supported fields to update." });
        try
        {
            var existing = await _activities.GetAsync(id, ct);
            if (existing is null) return NotFound();

            if (req.Name is not null)
            {
                // Delegate name change to RenameAsync for collision checks
                existing = await _activities.RenameAsync(id, req.Name, ct);
            }

            if (req.Description is not null) existing.Description = req.Description;
            if (req.StartsAt.HasValue) existing.StartsAt = req.StartsAt.Value;
            if (req.EndsAt.HasValue) existing.EndsAt = req.EndsAt.Value;
            if (req.MaxScansPerParticipant.HasValue)
                existing.MaxScansPerParticipant = req.MaxScansPerParticipant.Value <= 0 ? -1 : req.MaxScansPerParticipant.Value;

            if (existing.EndsAt < existing.StartsAt)
                return BadRequest(new { error = "End date must be after start date." });

            await _activities.UpdateAsync(existing, ct);
            return Ok(Map(existing));
        }
        catch (KeyNotFoundException) { return NotFound(); }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
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

    /// <summary>
    /// Removes a single participant from an activity together with every
    /// scan that referenced them. Reset-style cascade is intentional: if
    /// the participant goes, their scans must go too — otherwise the
    /// dashboard counters and scan history would dangle.
    /// </summary>
    [HttpDelete("{id}/participants/{participantId}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteParticipant(string id, string participantId, CancellationToken ct)
    {
        var participant = await _participants.GetAsync(id, participantId, ct);
        if (participant is null) return NotFound();

        // Cascade-delete the participant's scans first so a partial failure
        // never leaves orphan scans pointing at a missing participant.
        var scansRepo = _factory.GetRepository<ScanEntity>(ScanService.TableName);
        var deletedScans = 0;
        await foreach (var s in scansRepo.QueryAsync(null, ct))
        {
            if (s.PartitionKey == id && s.ParticipantId == participantId)
            {
                await scansRepo.DeleteAsync(s.PartitionKey, s.RowKey, ct);
                deletedScans++;
            }
        }

        var partsRepo = _factory.GetRepository<ParticipantEntity>(ParticipantService.TableName);
        await partsRepo.DeleteAsync(id, participantId, ct);
        return Ok(new { participantDeleted = true, scansDeleted = deletedScans });
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

    private static ActivityResponse Map(ActivityEntity a) =>
        new(a.RowKey, a.Name, a.Description, a.StartsAt, a.EndsAt, a.MaxScansPerParticipant, a.IsActive, a.IsDefault);
}
