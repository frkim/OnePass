using OnePass.Api.Services;

namespace OnePass.Api.Services;

public class RetentionOptions
{
    /// <summary>Default retention is 30 days (admins can override).</summary>
    public int RetentionDays { get; set; } = 30;
    public int CheckIntervalHours { get; set; } = 6;
}

/// <summary>
/// Background service that archives scan records older than the configured
/// retention window. Helps comply with privacy regulations such as GDPR.
/// </summary>
public sealed class RetentionService : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly RetentionOptions _opts;
    private readonly ILogger<RetentionService> _logger;

    public RetentionService(IServiceProvider sp, RetentionOptions opts, ILogger<RetentionService> logger)
    {
        _sp = sp;
        _opts = opts;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromHours(Math.Max(1, _opts.CheckIntervalHours));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _sp.CreateScope();
                var scans = scope.ServiceProvider.GetRequiredService<IScanService>();
                var archived = await scans.ArchiveOlderThanAsync(TimeSpan.FromDays(_opts.RetentionDays), stoppingToken);
                if (archived > 0)
                    _logger.LogInformation("Retention sweep archived {Count} scans older than {Days} days", archived, _opts.RetentionDays);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Retention sweep failed");
            }
            try { await Task.Delay(interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
