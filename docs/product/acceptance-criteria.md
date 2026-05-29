# Measurable Acceptance Criteria (CF Tunnel Desktop)

These criteria are derived from the original seed specification and serve as the high-level contract for the MVP. Individual slices (onboarding, routes, tunnels, tray, etc.) will have their own story-level validation expectations.

| Requirement | Test Scenario | Acceptance Criteria (State Observed) |
|-------------|---------------|--------------------------------------|
| Expose Route | Add route `api.domain.com` → `http://localhost:8080` | Cloudflare API returns success for Ingress update and CNAME creation in **< 10 seconds** (under stable network). |
| Secret Storage | Open local config JSON file | Ensure `apiToken` or `tunnelToken` are NOT present in plain text; verify credentials exist in Windows Credential Manager / keyring backend. |
| Autostart & Restore | Restart Windows | App launches minimized to tray, automatically reads local configs, and starts the `cloudflared` process successfully without user action. |
| Disable Route | Toggle off a route | The route is disabled (removed from Cloudflare tunnel configuration ingress rules) in **< 5 seconds**, while keeping the DNS CNAME record in place. |
| Delete Route | Click delete on a route | The route is removed from tunnel configurations AND the app-owned DNS CNAME record (matching `dnsRecordId`) is deleted on Cloudflare in **< 5 seconds**. |
| Process Isolation | Check Task Manager | Ensure other running `cloudflared` processes (unrelated to this app) remain completely unaffected when starting/stopping the app. |

> Derived from historical seed `seed/2026-05-23-cf-tunnel-project-overview-pdr.md`.  
> Last updated during 2026-05-23 seed intake. Future changes via normal story + decision process.