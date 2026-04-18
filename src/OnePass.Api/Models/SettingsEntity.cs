using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// Application-wide settings (singleton). A single row stored under a fixed
/// partition/row key so it can be fetched/updated atomically by admins.
/// </summary>
public class SettingsEntity : IEntity
{
    public const string SingletonPartitionKey = "Settings";
    public const string SingletonRowKey = "global";

    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = SingletonPartitionKey;

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = SingletonRowKey;

    /// <summary>Public-facing name of the event/installation displayed in the UI.</summary>
    public string EventName { get; set; } = string.Empty;

    /// <summary>
    /// Activity id selected by the admin as the default (used by all users
    /// who have not picked their own default).
    /// </summary>
    public string? DefaultActivityId { get; set; }
}
