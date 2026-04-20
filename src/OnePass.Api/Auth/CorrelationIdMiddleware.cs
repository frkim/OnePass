using System.Diagnostics;

namespace OnePass.Api.Auth;

/// <summary>
/// Phase 0 hardening: assigns a stable correlation id to every request and
/// echoes it back via the <c>X-Correlation-Id</c> response header so client
/// logs (and the SPA) can be tied back to a server-side trace. Honours an
/// inbound id if the caller already supplied one.
/// </summary>
public sealed class CorrelationIdMiddleware
{
    public const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var inbound = ctx.Request.Headers[HeaderName].ToString();
        var id = string.IsNullOrWhiteSpace(inbound)
            ? (Activity.Current?.TraceId.ToString() ?? Guid.NewGuid().ToString("N"))
            : inbound;

        ctx.Items["CorrelationId"] = id;
        ctx.Response.OnStarting(() =>
        {
            ctx.Response.Headers[HeaderName] = id;
            return Task.CompletedTask;
        });

        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = id,
            ["RequestPath"] = ctx.Request.Path.ToString(),
        }))
        {
            await _next(ctx);
        }
    }
}
