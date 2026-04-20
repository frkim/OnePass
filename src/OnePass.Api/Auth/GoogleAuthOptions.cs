namespace OnePass.Api.Auth;

/// <summary>
/// Google OAuth bindings. Read from the <c>Auth:Google</c> configuration
/// section. When <see cref="ClientId"/> or <see cref="ClientSecret"/> is
/// missing the Google authentication handler is not registered and the
/// SPA hides the "Continue with Google" button by virtue of
/// <c>GET /api/auth/providers</c> reporting <c>google = false</c>.
/// </summary>
public sealed class GoogleAuthOptions
{
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }

    /// <summary>
    /// Where to send the browser after the Google callback completes
    /// successfully. Must be an absolute URL on the SPA side. Defaults to
    /// <c>/auth/callback</c> (a same-origin SPA route handled by
    /// <c>AuthCallbackPage</c>) which works both in dev (Vite proxy) and
    /// in production (SPA + API on the same App Service host).
    /// </summary>
    public string SpaCallbackPath { get; set; } = "/auth/callback";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}
