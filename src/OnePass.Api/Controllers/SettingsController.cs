using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnePass.Api.Dtos;
using OnePass.Api.Models;
using OnePass.Api.Services;

namespace OnePass.Api.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize]
public class SettingsController : ControllerBase
{
    private readonly ISettingsService _settings;
    private readonly IActivityService _activities;

    public SettingsController(ISettingsService settings, IActivityService activities)
    {
        _settings = settings;
        _activities = activities;
    }

    [HttpGet]
    public async Task<ActionResult<SettingsResponse>> Get(CancellationToken ct)
    {
        var s = await _settings.GetAsync(ct);
        return new SettingsResponse(s.EventName, s.DefaultActivityId);
    }

    [HttpPut]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<SettingsResponse>> Update([FromBody] UpdateSettingsRequest req, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(req.DefaultActivityId))
        {
            var activity = await _activities.GetAsync(req.DefaultActivityId!, ct);
            if (activity is null)
                return BadRequest(new { error = "Default activity does not exist." });
        }
        var s = await _settings.UpdateAsync(req.EventName, req.DefaultActivityId, ct);
        return new SettingsResponse(s.EventName, s.DefaultActivityId);
    }
}
