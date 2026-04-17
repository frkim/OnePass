using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
builder.Services.AddSingleton<ITableStoreFactory, AzureTableStoreFactory>();
builder.Services.AddSingleton<IUserService, UserService>();
builder.Services.AddSingleton<IActivityService, ActivityService>();
builder.Services.AddSingleton<IParticipantService, ParticipantService>();
builder.Services.AddSingleton<IScanService, ScanService>();

// ---------- Retention ----------
var retention = new RetentionOptions();
builder.Configuration.GetSection("Retention").Bind(retention);
builder.Services.AddSingleton(retention);
builder.Services.AddHostedService<RetentionService>();

// ---------- Auth ----------
builder.Services
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
builder.Services.AddAuthorization();

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

// ---------- Dev seeding (creates a default Admin for local dev only) ----------
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var users = scope.ServiceProvider.GetRequiredService<IUserService>();
    if (await users.FindByEmailOrUsernameAsync("admin@onepass.local") is null)
    {
        await users.CreateAsync("admin@onepass.local", "admin", "ChangeMe123!", Roles.Admin);
        app.Logger.LogWarning("Development seed admin created: admin@onepass.local / ChangeMe123! — CHANGE BEFORE ANY PUBLIC USE.");
    }
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

app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));

app.Run();

/// <summary>Exposes the app entry point for WebApplicationFactory in integration tests.</summary>
public partial class Program { }
