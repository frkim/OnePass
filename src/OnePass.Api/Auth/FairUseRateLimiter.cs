using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace OnePass.Api.Auth;

/// <summary>
/// Phase 5 / Phase 7 fair-use enforcement. Two partitioned policies:
///   * <see cref="AnonymousPolicyName"/> \u2014 strict per-IP cap on unauthenticated
///     endpoints (login, register, accept-invitation) to blunt brute-force
///     and account-spam.
///   * <see cref="TenantPolicyName"/> \u2014 generous per-org + per-user cap that
///     applies to authenticated endpoints. Returns <c>429</c> with a friendly
///     payload pointing the user at the docs (instead of an opaque empty body).
/// Both policies are best-effort process-local; multi-instance deployments
/// should route through Front Door's rate-limit policy as the primary layer.
/// </summary>
public static class FairUseRateLimiter
{
    public const string AnonymousPolicyName = "anon-strict";
    public const string TenantPolicyName = "tenant-fair-use";

    public static IServiceCollection AddOnePassRateLimiter(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.ContentType = "application/json";
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
                    ctx.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString();
                await ctx.HttpContext.Response.WriteAsync(
                    """{"code":"rate_limited","error":"You're going a little fast \u2014 please wait a moment and try again. OnePass is free software protected by fair-use limits."}""",
                    ct);
            };

            // Per-IP limit on anonymous endpoints (login, register, invitation accept).
            options.AddPolicy(AnonymousPolicyName, ctx =>
            {
                var key = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 30,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                });
            });

            // Per (OrgId, sub) for authenticated requests; falls back to per-IP
            // when no tenant scope has been resolved yet.
            options.AddPolicy(TenantPolicyName, ctx =>
            {
                var tenant = ctx.RequestServices.GetService(typeof(ITenantContext)) as ITenantContext;
                var sub = ctx.User?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
                var keyParts = new[]
                {
                    tenant?.HasTenant == true ? tenant.OrgId : "no-tenant",
                    sub ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
                };
                var key = string.Join("|", keyParts);
                return RateLimitPartition.GetSlidingWindowLimiter(key, _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = 600,
                    Window = TimeSpan.FromMinutes(1),
                    SegmentsPerWindow = 6,
                    QueueLimit = 0,
                    AutoReplenishment = true,
                });
            });

            // Catch-all so endpoints that do not opt into a specific policy
            // still benefit from a sane default.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
            {
                var key = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 1200,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                });
            });
        });
        return services;
    }
}
