using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IParticipantService
{
    Task<ParticipantEntity> CreateAsync(string activityId, string displayName, string? email, string orgId = "", string eventId = "", CancellationToken ct = default);
    Task<ParticipantEntity?> GetAsync(string activityId, string participantId, CancellationToken ct = default);
    Task<IReadOnlyList<ParticipantEntity>> ListForActivityAsync(string activityId, CancellationToken ct = default);
    Task UpsertAsync(ParticipantEntity participant, CancellationToken ct = default);
}

public sealed class ParticipantService : IParticipantService
{
    internal const string TableName = "participants";
    private readonly ITableRepository<ParticipantEntity> _participants;

    public ParticipantService(ITableStoreFactory factory)
    {
        _participants = factory.GetRepository<ParticipantEntity>(TableName);
    }

    public async Task<ParticipantEntity> CreateAsync(string activityId, string displayName, string? email, string orgId = "", string eventId = "", CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(activityId)) throw new ArgumentException("ActivityId required", nameof(activityId));
        if (string.IsNullOrWhiteSpace(displayName)) throw new ArgumentException("DisplayName required", nameof(displayName));

        var p = new ParticipantEntity
        {
            PartitionKey = activityId,
            DisplayName = displayName.Trim(),
            Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim(),
            OrgId = orgId,
            EventId = eventId,
        };
        await _participants.UpsertAsync(p, ct);
        return p;
    }

    public Task<ParticipantEntity?> GetAsync(string activityId, string participantId, CancellationToken ct = default) =>
        _participants.GetAsync(activityId, participantId, ct);

    public Task UpsertAsync(ParticipantEntity participant, CancellationToken ct = default) =>
        _participants.UpsertAsync(participant, ct);

    public async Task<IReadOnlyList<ParticipantEntity>> ListForActivityAsync(string activityId, CancellationToken ct = default)
    {
        var list = new List<ParticipantEntity>();
        await foreach (var p in _participants.QueryAsync(null, ct))
        {
            if (p.PartitionKey == activityId) list.Add(p);
        }
        return list;
    }
}
