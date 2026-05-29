# Security & Secret Management (CF Tunnel Desktop)

## Credential Storage & Keyring Integration
- **Zero Plain-Text Secrets:** API Tokens and Tunnel Tokens are never saved in the plain JSON config file.
- **Unidirectional Secret Flow (Post-Onboarding):**
  - Token is sent to Rust backend on submit, verified, and stored in Windows Credential Manager.
  - After initial save, raw tokens are **never returned** to the frontend.
  - Frontend only ever receives redacted views (`tokenPresent: true`).
- **Token Rotation & Deletion:** Backend validates before overwrite; full wipe removes the credential entry.

## Command-Line Process Security
- `cloudflared tunnel run --token <...>` would expose the token on the command line.
- **MVP Mitigations:**
  - Raw tokens redacted from all logs.
  - Full CLI strings containing secrets never exposed to frontend or logged.
  - Sidecar spawned strictly from Rust (never via user-visible shell).

## Reconciliation & Drift
- Local JSON = Desired State (source of truth).
- Cloudflare Dashboard = Remote Actual State.
- On drift detection: warning banner + explicit user consent before overwriting remote state. No silent destructive sync.

> Derived from historical seed `seed/2026-05-23-cf-tunnel-project-overview-pdr.md`.  
> Last updated during 2026-05-23 seed intake. Future changes via normal story + decision process.