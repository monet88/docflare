---
phase: 1
title: "App scaffold"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: App scaffold

## Context Links

- Operational blocker: `plans/260529-1446-cf-tunnel-operational-flow/plan.md:21`, `:66-68`
- Product stack: `docs/product/overview.md:22-28`
- Onboarding scaffold scope: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:24-35`, `:245-260`

## Overview

Create the minimal Tauri v2 + React + TypeScript + Vite app skeleton required for later Epic 1 work. No Cloudflare logic yet.

## Key Insights

- Current repo has no `package.json`, `src/`, `src-tauri/`, or `Cargo.toml`; scaffold is a hard prerequisite.
- Keep scaffold small; spec explicitly says do not prebuild unrelated MVP screens (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:264-266`).
- Operational plan depends on standard Tauri/React boundaries, not a custom architecture (`plans/260529-1446-cf-tunnel-operational-flow/plan.md:32-35`).

## Requirements

- Functional:
  - Add npm workspace root for Vite frontend and Tauri CLI scripts.
  - Add `src-tauri/` Rust host with one health/test command and Tauri bootstrap.
  - Add minimal React app shell that can host onboarding next phase.
- Non-functional:
  - Scripts must support `npm run tauri dev`, `npm run build`, `npm run test` or `npm test`.
  - Keep file layout simple and phase-local; no tray/autostart/plugins not needed for onboarding.
  - Preserve existing docs, plans, scripts, and harness files.

## Architecture

```text
npm scripts
  -> Vite dev/build/test
  -> Tauri CLI
     -> src-tauri/src/lib.rs + main.rs
        -> registers commands for later onboarding phases
React App
  -> placeholder shell only in this phase
```

Data flow now:
- User launches desktop app.
- Vite frontend loads inside Tauri window.
- One non-secret smoke command proves frontend/backend bridge.

## Related Code Files

- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`, `src/app.tsx`, `src/styles.css`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/health.rs`
- Create: `src/test/setup.ts`, minimal frontend test config files if needed

## Implementation Steps

1. Generate or hand-create Tauri v2 + React + TS + Vite scaffold using the documented package/script contract.
2. Normalize scripts so repo uses npm commands expected by product docs.
3. Add minimal Rust command such as `health_check()` returning static non-secret data.
4. Register the command in `src-tauri/src/lib.rs`.
5. Add minimal React shell and one button/effect proving `invoke` wiring.
6. Add baseline test runner config for frontend unit tests.
7. Verify dev boot and production build before Phase 2 starts.

## Todo List

- [ ] Create frontend package/config files.
- [ ] Create `src-tauri/` host config and entrypoints.
- [ ] Add minimal invoke smoke path.
- [ ] Add frontend test runner config.
- [ ] Verify `npm run tauri dev` and `npm run build` work.

## Success Criteria

- [ ] `npm install` succeeds.
- [ ] `npm run tauri dev` starts the app locally.
- [ ] Frontend can call one Rust command through Tauri invoke.
- [ ] `npm run build` succeeds.
- [ ] Scaffold stays limited to onboarding foundation only.

## Risk Assessment

- High: Tauri v2 config/script mismatch blocks all later phases. Mitigation: lock scripts and config names in this phase before domain work.
- Medium: Adding unnecessary plugins increases churn. Mitigation: no tray/autostart/shell plugin unless onboarding needs it.
- Medium: Cross-file bootstrap ownership conflict. Mitigation: Phase 1 owns all root scaffold files; later phases only extend them.

## Security Considerations

- No secrets or environment tokens introduced in scaffold.
- Smoke command must return only static data.
- No PATH-based `cloudflared` logic; explicitly out of scope here (`plans/260529-1446-cf-tunnel-operational-flow/plan.md:28`, `docs/product/non-functional-requirements.md:14-21`).

## Next Steps

- Phase 2 can start after scaffold boot/build validation passes.
- Do not update operational-flow blockers yet; scaffold alone is insufficient.