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

    public ActivitiesController(IActivityService activities, IParticipantService participants, IScanService scans)
    {
        _activities = activities;
        _participants = participants;
        _scans = scans;
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
        return a is null ? NotFound() : Map(a);
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
                MaxScansPerParticipant = Math.Max(1, req.MaxScansPerParticipant),
                CreatedByUserId = userId,
            };
            var created = await _activities.CreateAsync(entity, ct);
            return CreatedAtAction(nameof(Get), new { id = created.RowKey }, Map(created));
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await _activities.DeleteAsync(id, ct);
        return NoContent();
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
        new(a.RowKey, a.Name, a.Description, a.StartsAt, a.EndsAt, a.MaxScansPerParticipant, a.IsActive);
}
