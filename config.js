'use strict';

module.exports = {
    // ── Server ─────────────────────────────────────────────────
    PORT:       process.env.PORT || 40000,

    // ── Cooldown ────────────────────────────────────────
    // Minimum ms between tunnel generations (global). Default: 3600000 (1 hr)
    COOLDOWN_MS: 3600000,

    // ── Pages ────────────────────────────────────────
    // Each key becomes a route: localhost:PORT/<key>
    // - title:   display name shown on the dashboard
    // - mainUrl: the primary link shown at the top
    // - port:    local port that `cloudflare tunnel` will expose
    PAGES: {
        grapplegame: {
            title:   'Untitled Grapple Game',
            mainUrl: 'no_permanent_url_yet',
            port:    3000,
        },
    }
};
