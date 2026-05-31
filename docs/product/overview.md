# CF Tunnel Desktop — Cross-platform — Overview

**Product:** Cloudflare Local Tunnel Manager (Tauri v2 + React + TypeScript + Vite), shipping for Windows, macOS, and Linux.  
**Goal:** Let developers expose `localhost` services to the public internet using custom domains through Cloudflare Tunnel with a native, lightweight, secure desktop app.

## Problem
Developers need a simple, native desktop app to map local ports (e.g. `http://localhost:3000`) to public subdomains via Cloudflare Tunnel without manual `cloudflared` CLI work or leaking secrets.

## MVP Scope

**In scope**
- Manual endpoint management (local target → subdomain)
- Cross-platform desktop: Windows 10/11 x64, macOS (Intel + Apple Silicon), Linux x64
- Local JSON config (non-secret metadata only)
- System tray + minimize on close
- Autostart on boot with tunnel restore
- Secrets in OS credential manager only (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- Single-instance lock

**Out of scope (MVP)**
- Docker scanning, external DBs, multi-host sync, Cloudflare Access SSO, OAuth, auto-discovery.

## High-Level Architecture
- **Frontend:** React + TS + Vite + vanilla CSS (dark/glassmorphism)
- **Backend:** Tauri v2 (Rust) + `cloudflared` sidecar (pinned)
  - Tauri plugins: autostart, shell, store, single-instance
  - Keyring via `keyring` crate for secrets
- Direct Cloudflare API calls from Rust for zones, DNS, tunnels.

## Core UX Surfaces (MVP)
1. Onboarding (API Token + Account/Zone)
2. Tunnel setup + route table
3. Log console (redacted)
4. Settings (autostart, close-to-tray, clear data)
5. System tray menu

> Derived from historical seed `seed/2026-05-23-cf-tunnel-project-overview-pdr.md`.  
> Last updated during 2026-05-23 seed intake. Future changes via normal story + decision process.
>
> See: ADR [0007 Cross-platform release pipeline](../decisions/0007-cross-platform-release-pipeline.md).