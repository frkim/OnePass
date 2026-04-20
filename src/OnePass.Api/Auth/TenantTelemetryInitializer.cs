using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.ApplicationInsights.Channel;
using Microsoft.ApplicationInsights.DataContracts;
using Microsoft.ApplicationInsights.Extensibility;

namespace OnePass.Api.Auth;

/// <summary>
/// Phase 5 observability: enriches every Application Insights telemetry item
/// with the active <c>OrgId</c>, <c>UserId</c>, and correlation id so cross-
/// tenant analytics and per-user debugging are trivial in the portal.
/// </summary>
public sealed class TenantTelemetryInitializer : ITelemetryInitializer
{
    private readonly IHttpContextAccessor _http;
    public TenantTelemetryInitializer(IHttpContextAccessor http) => _http = http;

    public void Initialize(ITelemetry telemetry)
    {
        var ctx = _http.HttpContext;
        if (ctx is null) return;

        var props = (telemetry as ISupportProperties)?.Properties;
        if (props is null) return;

        var tenant = ctx.RequestServices.GetService(typeof(ITenantContext)) as ITenantContext;
        if (tenant is { HasTenant: true })
        {
            props["OrgId"] = tenant.OrgId;
            props["OrgRole"] = tenant.Role;
        }

        var userId = ctx.User?.FindFirstValue(JwtRegisteredClaimNames.Sub)
                     ?? ctx.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrWhiteSpace(userId))
            props["UserId"] = userId;

        if (ctx.Items.TryGetValue("CorrelationId", out var cid) && cid is string s && !string.IsNullOrEmpty(s))
            props["CorrelationId"] = s;
    }
}
