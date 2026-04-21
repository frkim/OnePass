using System.Security.Cryptography;
using System.Text;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using OnePass.Api.Auth;
using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- JWT options ----------
var jwtOptions = new JwtOptions();
builder.Configuration.GetSection("Jwt").Bind(jwtOptions);
if (string.IsNullOrWhiteSpace(jwtOptions.SigningKey))
{
    if (builder.Environment.IsDevelopment())
    {
        // Generate a random dev-only signing key so tokens are valid for a run.
        var buf = new byte[64];
        RandomNumberGenerator.Fill(buf);
        jwtOptions.SigningKey = Convert.ToBase64String(buf);
    }
    else
    {
        throw new InvalidOperationException(
            "Jwt:SigningKey must be configured (e.g. via environment variable or Key Vault) in non-development environments.");
    }
}
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();

// ---------- Data ----------
builder.Services.AddSingleton<ITableStoreFactory, CosmosTableStoreFactory>();
builder.Services.AddSingleton<IUserService, UserService>();
builder.Services.AddSingleton<IActivityService, ActivityService>();
builder.Services.AddSingleton<IParticipantService, ParticipantService>();
builder.Services.AddSingleton<IScanService, ScanService>();
// SaaS services (Phase 1)
builder.Services.AddSingleton<IOrganizationService, OrganizationService>();
builder.Services.AddSingleton<IMembershipService, MembershipService>();
builder.Services.AddSingleton<IEventService, EventService>();
builder.Services.AddSingleton<IInvitationService, InvitationService>();
builder.Services.AddSingleton<IAuditService, AuditService>();
builder.Services.AddSingleton<IPlatformSettingsService, PlatformSettingsService>();

// ---------- Retention ----------
var retention = new RetentionOptions();
builder.Configuration.GetSection("Retention").Bind(retention);
builder.Services.AddSingleton(retention);
builder.Services.AddHostedService<RetentionService>();

// ---------- Auth ----------
var googleOptions = new GoogleAuthOptions();
builder.Configuration.GetSection("Auth:Google").Bind(googleOptions);
builder.Services.AddSingleton(googleOptions);

var microsoftOptions = new MicrosoftAuthOptions();
builder.Configuration.GetSection("Auth:Microsoft").Bind(microsoftOptions);
builder.Services.AddSingleton(microsoftOptions);

var authBuilder = builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        // Preserve original JWT claim types (e.g. "sub") so our controllers can read them.
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = System.Security.Claims.ClaimTypes.Name,
            RoleClaimType = System.Security.Claims.ClaimTypes.Role,
        };
    });

// External OAuth flows (Google, Microsoft, ...) share a short-lived
// correlation cookie scheme used to round-trip the OIDC state. Register
// it once whenever any external IdP is wired in this environment so the
// primary JWT scheme stays untouched. The cookie is wiped by the
// AuthController completion endpoints as soon as the JIT-provisioning is
// done.
if (googleOptions.IsConfigured || microsoftOptions.IsConfigured)
{
    authBuilder.AddCookie("ExternalAuth", o =>
    {
        o.Cookie.Name = "OnePass.ExternalAuth";
        o.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax;
        o.Cookie.HttpOnly = true;
        o.Cookie.SecurePolicy = Microsoft.AspNetCore.Http.CookieSecurePolicy.SameAsRequest;
        o.ExpireTimeSpan = TimeSpan.FromMinutes(10);
        o.SlidingExpiration = false;
    });
}

if (googleOptions.IsConfigured)
{
    authBuilder.AddGoogle("Google", o =>
    {
        o.ClientId = googleOptions.ClientId!;
        o.ClientSecret = googleOptions.ClientSecret!;
        o.SignInScheme = "ExternalAuth";
        o.CallbackPath = "/api/auth/google/callback";
        o.SaveTokens = false;
        o.Scope.Add("email");
        o.Scope.Add("profile");
        o.CorrelationCookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax;
    });
}

if (microsoftOptions.IsConfigured)
{
    // Microsoft Account works for both consumer (MSA) and work/school (AAD)
    // identities when the app registration's "Supported account types" is
    // set to "Accounts in any organizational directory and personal
    // Microsoft accounts" (i.e. the /common authority). The
    // MicrosoftAccount handler defaults to /common so the App Registration
    // controls the audience.
    authBuilder.AddMicrosoftAccount("Microsoft", o =>
    {
        o.ClientId = microsoftOptions.ClientId!;
        o.ClientSecret = microsoftOptions.ClientSecret!;
        o.SignInScheme = "ExternalAuth";
        o.CallbackPath = "/api/auth/microsoft/callback";
        o.SaveTokens = false;
        // "User.Read" yields the email/name claims we need without asking
        // for any extra Graph permissions beyond the default profile.
        o.Scope.Add("User.Read");
        o.CorrelationCookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax;
    });
}
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(TenantPolicies.OrgMember, p => p.RequireAuthenticatedUser()
        .AddRequirements(new OrgRoleRequirement(OrgRoles.All, acceptLegacyAdmin: true)));
    options.AddPolicy(TenantPolicies.OrgAdmin, p => p.RequireAuthenticatedUser()
        .AddRequirements(new OrgRoleRequirement(OrgRoles.OrgAdminOrAbove, acceptLegacyAdmin: true)));
    options.AddPolicy(TenantPolicies.OrgOwner, p => p.RequireAuthenticatedUser()
        .AddRequirements(new OrgRoleRequirement(new[] { OrgRoles.OrgOwner }, acceptLegacyAdmin: true)));
    options.AddPolicy(TenantPolicies.CanManageEvents, p => p.RequireAuthenticatedUser()
        .AddRequirements(new OrgRoleRequirement(OrgRoles.CanManageEvents, acceptLegacyAdmin: true)));
    options.AddPolicy(TenantPolicies.CanScan, p => p.RequireAuthenticatedUser()
        .AddRequirements(new OrgRoleRequirement(OrgRoles.CanScan, acceptLegacyAdmin: true)));
    options.AddPolicy(TenantPolicies.PlatformAdmin, p => p.RequireAuthenticatedUser()
        .AddRequirements(new OrgRoleRequirement(new[] { OrgRoles.PlatformAdmin }, acceptLegacyAdmin: false, acceptGlobalAdmin: true)));
});
// Tenant scope is per-request, populated by TenantContextMiddleware.
builder.Services.AddScoped<ITenantContext, TenantContext>();
builder.Services.AddScoped<IAuthorizationHandler, OrgRoleHandler>();

// ---------- Phase 5 observability ----------
builder.Services.AddHttpContextAccessor();
builder.Services.AddApplicationInsightsTelemetry();
builder.Services.AddSingleton<ITelemetryInitializer, TenantTelemetryInitializer>();

// ---------- Phase 7 fair-use rate limiting ----------
builder.Services.AddOnePassRateLimiter();

// ---------- CORS ----------
const string CorsPolicy = "OnePassFrontend";
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
                      ?? new[] { "http://localhost:5173" };
        policy.WithOrigins(origins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ---------- Controllers + OpenAPI (Swashbuckle for spec + Scalar for UI) ----------
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "OnePass API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
        }] = Array.Empty<string>()
    });
});

var app = builder.Build();

// ---------- Seeding ----------
// Phase 0 hardening: the legacy seed admin (admin@onepass.local / Devoxx2026!)
// is now strictly opt-in via Bootstrap:SeedDefaultAdmin. Production deployments
// MUST leave this off and provision the first owner via the bootstrap script
// (see docs/saas-migration-plan.md §Phase 0).
{
    using var scope = app.Services.CreateScope();
    var seedDefaultAdmin = builder.Configuration.GetValue<bool?>("Bootstrap:SeedDefaultAdmin")
                           ?? app.Environment.IsDevelopment();

    var users = scope.ServiceProvider.GetRequiredService<IUserService>();
    var orgs = scope.ServiceProvider.GetRequiredService<IOrganizationService>();
    var memberships = scope.ServiceProvider.GetRequiredService<IMembershipService>();
    var events = scope.ServiceProvider.GetRequiredService<IEventService>();
    var activities = scope.ServiceProvider.GetRequiredService<IActivityService>();

    UserEntity? admin = null;
    UserEntity? globalAdmin = null;
    if (seedDefaultAdmin)
    {
        admin = await users.FindByEmailOrUsernameAsync("admin@onepass.local");
        if (admin is null)
        {
            // Use the configured password if provided; otherwise generate a strong
            // random one and write it to logs once. Hardcoded "Devoxx2026!" is
            // gone — it was a known credential and a production footgun.
            var seedPassword = builder.Configuration["Bootstrap:DefaultAdminPassword"];
            var generated = string.IsNullOrWhiteSpace(seedPassword);
            if (generated) seedPassword = GenerateStrongPassword();
            admin = await users.CreateAsync("admin@onepass.local", "admin", seedPassword!, Roles.Admin);
            if (generated)
                app.Logger.LogWarning(
                    "Seed admin created: admin@onepass.local / {Password} — store this credential and CHANGE IT before any public use. " +
                    "To skip seeding, set Bootstrap:SeedDefaultAdmin=false.",
                    seedPassword);
            else
                app.Logger.LogWarning(
                    "Seed admin created with configured password (Bootstrap:DefaultAdminPassword). CHANGE IT before any public use.");
        }

        // Seed a Global Admin account — the only role that can manage platform-wide
        // settings. The fixed id "global-admin" makes it easy to locate in dev.
        globalAdmin = await users.FindByEmailOrUsernameAsync("global-admin");
        if (globalAdmin is null)
        {
            globalAdmin = await users.CreateAsync("globaladmin@onepass.local", "global-admin", "OnePass2026!", Roles.GlobalAdmin);
            app.Logger.LogWarning(
                "Seed global admin created: global-admin / OnePass2026! — CHANGE this credential before any public use.");
        }
    }

    // Bootstrap the "default" SaaS organisation that wraps any pre-existing
    // single-tenant data so the legacy controllers keep functioning during
    // the migration. New installations also get one default org so the SPA
    // always has somewhere to land.
    var defaultOrg = await orgs.GetBySlugAsync("default");
    if (defaultOrg is null)
    {
        var ownerId = admin?.RowKey ?? "system";
        var devOrgId = $"org-{Random.Shared.Next(1000, 10000)}";
        defaultOrg = await orgs.CreateAsync("Default Organization", "default", ownerId, devOrgId);
        app.Logger.LogInformation("Default organisation created (slug=default, id={OrgId}).", defaultOrg.RowKey);
    }
    if (admin is not null)
    {
        var existingMembership = await memberships.GetAsync(defaultOrg.RowKey, admin.RowKey);
        if (existingMembership is null)
            await memberships.AddAsync(defaultOrg.RowKey, admin.RowKey, OrgRoles.OrgOwner);
        if (string.IsNullOrEmpty(admin.DefaultOrgId))
        {
            admin.DefaultOrgId = defaultOrg.RowKey;
            await users.UpdateAsync(admin);
        }
    }

    // Seed a regular user for development/testing
    if (seedDefaultAdmin)
    {
        var user1 = await users.FindByEmailOrUsernameAsync("user1@onepass.local");
        if (user1 is null)
        {
            var seedPassword = builder.Configuration["Bootstrap:DefaultAdminPassword"] ?? "OnePass2026!";
            user1 = await users.CreateAsync("user1@onepass.local", "user1", seedPassword, Roles.User);
            app.Logger.LogInformation("Seed user created: user1@onepass.local / user1");
        }
        var user1Membership = await memberships.GetAsync(defaultOrg.RowKey, user1.RowKey);
        if (user1Membership is null)
            await memberships.AddAsync(defaultOrg.RowKey, user1.RowKey, OrgRoles.Scanner);
        if (string.IsNullOrEmpty(user1.DefaultOrgId))
        {
            user1.DefaultOrgId = defaultOrg.RowKey;
            await users.UpdateAsync(user1);
        }

        var user2 = await users.FindByEmailOrUsernameAsync("user2@onepass.local");
        if (user2 is null)
        {
            var seedPassword2 = builder.Configuration["Bootstrap:DefaultAdminPassword"] ?? "OnePass2026!";
            user2 = await users.CreateAsync("user2@onepass.local", "user2", seedPassword2, Roles.User);
            app.Logger.LogInformation("Seed user created: user2@onepass.local / user2");
        }
        var user2Membership = await memberships.GetAsync(defaultOrg.RowKey, user2.RowKey);
        if (user2Membership is null)
            await memberships.AddAsync(defaultOrg.RowKey, user2.RowKey, OrgRoles.Scanner);
        if (string.IsNullOrEmpty(user2.DefaultOrgId))
        {
            user2.DefaultOrgId = defaultOrg.RowKey;
            await users.UpdateAsync(user2);
        }
    }

    var orgEvents = await events.ListForOrgAsync(defaultOrg.RowKey);
    EventEntity defaultEvent;
    if (orgEvents.Count == 0)
    {
        defaultEvent = await events.CreateAsync(defaultOrg.RowKey, "Default event", "default",
            admin?.RowKey ?? "system");
        app.Logger.LogInformation("Default event created (orgId={OrgId}, eventId={EventId}).",
            defaultOrg.RowKey, defaultEvent.RowKey);
    }
    else
    {
        defaultEvent = orgEvents[0];
    }

    var defaultActivity = await activities.FindByNameAsync("default");
    if (defaultActivity is null)
    {
        var now = DateTimeOffset.UtcNow;
        defaultActivity = await activities.CreateAsync(new OnePass.Api.Models.ActivityEntity
        {
            Name = "default",
            Description = "Default activity",
            StartsAt = now.AddDays(-1),
            EndsAt = now.AddMonths(1),
            MaxScansPerParticipant = -1, // unlimited
            CreatedByUserId = admin?.RowKey ?? "system",
            IsActive = true,
            OrgId = defaultOrg.RowKey,
            EventId = defaultEvent.RowKey,
        });
        app.Logger.LogInformation("Seed default activity created (1 month, unlimited scans).");
    }
    else if (string.IsNullOrEmpty(defaultActivity.OrgId))
    {
        // Legacy default activity exists from a pre-SaaS install — annotate it.
        defaultActivity.OrgId = defaultOrg.RowKey;
        defaultActivity.EventId = defaultEvent.RowKey;
        await activities.UpdateAsync(defaultActivity);
    }

    if (defaultEvent.DefaultActivityId is null)
    {
        defaultEvent.DefaultActivityId = defaultActivity.RowKey;
        await events.UpdateAsync(defaultEvent);
    }

    // Mirror the event-default into the activity's stored IsDefault flag so
    // the legacy ActivitiesController and SPA can keep rendering a Default badge
    // without needing to look up the parent event on every request.
    if (!defaultActivity.IsDefault)
    {
        defaultActivity.IsDefault = true;
        await activities.UpdateAsync(defaultActivity);
    }
}

static string GenerateStrongPassword()
{
    // Suffix guarantees the password meets common complexity rules
    // (digit + lower + upper + special) regardless of the random body.
    const string ComplexitySuffix = "!1Aa";
    Span<byte> buf = stackalloc byte[24];
    RandomNumberGenerator.Fill(buf);
    return Convert.ToBase64String(buf).TrimEnd('=').Replace('+', '-').Replace('/', '_') + ComplexitySuffix;
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.MapScalarApiReference(options =>
    {
        options
            .WithTitle("OnePass API")
            .WithOpenApiRoutePattern("/swagger/{documentName}/swagger.json");
    });
}

// Serve the bundled SPA (built into wwwroot during publish) on the same origin.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors(CorsPolicy);
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<TenantContextMiddleware>();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));

// Anything that isn't an API/health/swagger route falls back to index.html so
// client-side react-router can handle the URL (deep links, refresh, etc.).
app.MapFallbackToFile("index.html");

app.Run();

/// <summary>Exposes the app entry point for WebApplicationFactory in integration tests.</summary>
public partial class Program { }
