---
title: "CF Tunnel Desktop — Operational Flow (Epics 2-6)"
description: "Operational flow plan for route CRUD, Cloudflare reconciliation, tunnel lifecycle, tray, and restore."
status: blocked
priority: P2
branch: "master"
tags: [cloudflare, tauri, operational-flow]
blockedBy: ["project:260529-2125-route-management"]
blocks: []
created: "2026-05-29T07:49:32.502Z"
createdBy: "ck:plan"
source: skill
---

# CF Tunnel Desktop — Operational Flow (Epics 2-6)

## Overview

Builds the post-onboarding operational flow: add hostname + target endpoint, reconcile to Cloudflare, start one local `cloudflared` tunnel, minimize to tray, and restore on boot.

This plan is **blocked in the current repo** until a Tauri v2 + React + TS + Vite app scaffold exists and Epic 1 onboarding has implemented `ProfileConfigStore`, `SecretStore`, `CloudflareClient`, and profile persistence.

## Locked Architecture Decisions

1. **One tunnel, many ingress.** Each profile owns one named Cloudflare tunnel; each route becomes one ingress rule plus one app-owned DNS CNAME to `<tunnelId>.cfargotunnel.com`.
2. **Tokens stay in keyring.** Local JSON stores only secret refs such as `apiTokenRef` and `tunnelTokenRef`; raw tokens are never returned to frontend after submit.
3. **Drift requires consent.** Reconcile previews remote/local drift and never overwrites Cloudflare dashboard changes without explicit user action.
4. **No production PATH lookup.** Tunnel lifecycle must use the pinned bundled sidecar from Epic 7; system PATH lookup is not allowed.

## Stack & Contracts

- Tauri v2 + Rust backend, React + TypeScript + Vite frontend.
- Keyring via Rust `keyring`; local JSON is desired state and uses atomic writes.
- Cloudflare API tokens are sent only in `Authorization: Bearer` headers.
- Reuse onboarding boundaries; do not create parallel stores or Cloudflare clients.

## Reference Implementation Notes

`proxypal` at `/media/monet/SSD Web/CodeBase/proxypal` can inform operational patterns only: process manager, status events, reconnect loop, close-to-tray, and atomic config write. Do not copy its system-PATH `cloudflared` discovery or Tunnel-Token-only product flow.

## Phases

| Phase | Name | Status | Primary blockers |
|-------|------|--------|------------------|
| 1 | [Route Management](./phase-01-route-management.md) | Blocked | app scaffold + onboarding store |
| 2 | [Cloudflare Reconciliation](./phase-02-cloudflare-reconciliation.md) | Blocked | Phase 1 + onboarding Cloudflare/secret services |
| 3 | [Tunnel Lifecycle](./phase-03-tunnel-lifecycle.md) | Blocked | Phase 2 + Epic 7 pinned sidecar |
| 4 | [System Tray & Single-Instance](./phase-04-system-tray-single-instance.md) | Blocked | Phase 3 status contract |
| 5 | [Autostart & Restore](./phase-05-autostart-restore.md) | Blocked | Phase 3 + Phase 4 |

## Phase Dependency Chain

```text
0 App scaffold + Epic 1 onboarding
  -> 1 Route CRUD
  -> 2 Cloudflare reconcile
  -> 3 Tunnel lifecycle (requires Epic 7 sidecar for live runs)
  -> 4 Tray + single-instance
  -> 5 Autostart + restore
```

Phase 4 may start earlier only after the Phase 3 status event contract is frozen; Phase 5 must wait for both Phase 3 and Phase 4.

## Dependencies

- Hard blocker: target implementation repo or this repo must contain the app scaffold (`src-tauri/`, `src/`, `Cargo.toml`, frontend package config).
- Hard blocker: Epic 1 onboarding implementation with profile config, keyring, and Cloudflare validation services.
- Hard blocker before Phase 3 live/manual validation: Epic 7 pinned, SHA256-verified `cloudflared` sidecar.
- Product acceptance timing to preserve: expose route < 10s, disable route < 5s, delete route < 5s under stable network.

## Success Criteria

- Required phase sections exist in all phase files.
- No phase claims production readiness while its hard blockers are unmet.
- Security constraints from `docs/product/security-and-secrets.md` remain explicit in each relevant phase.
