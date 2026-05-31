# Story Backlog

This backlog will be populated after a user provides a project spec or selects a
specific initiative.

Do not create every possible story packet up front. Create story packets when
the work is selected or when a product decision needs a durable place to land.

## Selected Direction

Token model: **API Token** (app calls Cloudflare API directly to manage DNS + tunnel
ingress). User-facing flow target: open app -> enter target endpoint + hostname -> start
tunnel -> minimize to tray, with enabled tunnels restored on boot.

Rejected alternative: Tunnel-Token model (proxypal-style). It is lighter to build but
pushes hostname/ingress config to the Cloudflare dashboard, so the user could not enter
the domain inside the app. That breaks the desired UX, so it is out.

## Candidate Epics

Ordered to complete the target flow. Onboarding is the only slice with a design today;
the rest are unsliced and need their own design + story packet when selected.

| # | Epic | Description | Status |
| --- | --- | --- | --- |
| 1 | Profile Onboarding | API Token + Account + Zone, validate, store token in keyring, persist non-secret metadata. | designed (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md`) |
| 2 | Route Management | CRUD for routes (`hostname` + `targetUrl` + `enabled`), local JSON desired state, target URL validation (loopback allow, LAN warn, non-http block). | unsliced |
| 3 | Cloudflare Reconciliation | Apply routes to Cloudflare: ensure tunnel exists, create/update ingress config, create/delete app-owned DNS CNAME (`dnsRecordId`), drift detection with explicit-consent reconcile. | unsliced |
| 4 | Tunnel Lifecycle | Spawn pinned `cloudflared` from Rust, start/stop, parse status, emit status events to UI, retry + reconnect. | unsliced |
| 5 | System Tray + Minimize | Tray menu, close-to-tray, minimize-on-close, single-instance lock. | unsliced |
| 6 | Autostart + Restore | Launch at boot minimized, reload config, restart enabled tunnels with no user action. | unsliced |
| 7 | Pinned Sidecar Build Hook | Download exact pinned `cloudflared`, verify SHA256, place in `src-tauri/binaries/`; build fails on missing binary/checksum. | unsliced |
| 8 | Redacted Log Console | In-app log view capped at 1000 lines, secrets redacted. | unsliced |

## Reference Implementation (proxypal)

`proxypal` (`/media/monet/SSD Web/CodeBase/proxypal`, SolidJS + Tauri v2, commit `6af0181c`)
ships a working tunnel manager on the Tunnel-Token model. It does NOT match our API-Token
data model, so port operational patterns only, not the data flow:

| Our Epic | Reusable proxypal pattern | Source |
| --- | --- | --- |
| 4 Tunnel Lifecycle | Spawn `cloudflared`, read stderr to detect connected/url/error, retry 3x + reconnect, `kill_on_drop` | `src-tauri/src/cloudflare_manager.rs` |
| 4 Tunnel Lifecycle | Status events to UI (`emit("cloudflare-status-changed")`) + status dot UI | `cloudflare_manager.rs:113`, `src/components/settings/CloudflareSettings.tsx:117` |
| 6 Autostart + Restore | On setup, load config and reconnect every `enabled` tunnel | `src-tauri/src/lib.rs:328` |
| 2 Route Management | Atomic config write (temp file + rename, Windows lock retry) | `src-tauri/src/config.rs:306` |
| 5 Tray | `close_to_tray` default, tray setup | `src-tauri/src/lib.rs` (`setup_tray`) |

Divergences to NOT copy:
- proxypal does NOT bundle `cloudflared`; it greps the system PATH (`find_cloudflared_path`).
  Our NFR requires a pinned, SHA256-verified bundled sidecar (Epic 7).
- proxypal has no in-app hostname/DNS management; that is exactly our Epics 2-3.
