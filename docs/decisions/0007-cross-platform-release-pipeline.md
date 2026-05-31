# 0007 Cross-platform release pipeline

Date: 2026-05-31

## Status

Accepted

## Context

Docflare shipped as a Windows-only Tauri app. The product now targets developers
on Windows, macOS, and Linux, so the release pipeline must produce installable,
self-updating artifacts for all three. Two hard constraints shaped the design:

- **No code-signing budget.** No Apple Developer ID, no Windows Authenticode
  certificate. Artifacts ship unsigned; OS gatekeepers (Gatekeeper, SmartScreen)
  warn on first launch.
- **Internal distribution.** Releases serve a known internal team, not the public
  app stores.

The pinned `cloudflared` sidecar was fetched by a Windows-only PowerShell script
(`download-sidecar.ps1`) — unusable in a cross-platform CI matrix.

Source design: `docs/superpowers/specs/2026-05-31-cross-platform-release-pipeline-design.md`.

## Decision

1. **Targets:** four Rust triples — `aarch64-apple-darwin`, `x86_64-apple-darwin`,
   `x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`. No arm64 Windows/Linux.
2. **Distribution:** GitHub Actions matrix build via `tauri-apps/tauri-action@v0`.
   No code-signing.
3. **Bundles:** `dmg` + `app` (macOS), `nsis` + portable `.zip` (Windows),
   `deb` + `appimage` (Linux). **RPM dropped** — no Fedora/RHEL target in MVP.
4. **Auto-updater:** Tauri updater plugin with minisign signatures, served from
   GitHub Releases CDN. A merged `latest.json` (one entry per platform) is the
   updater manifest.
5. **Sidecar:** cross-platform Node script (`download-sidecar.mjs`) replaces the
   PowerShell script. A committed `sidecar-manifest.json` is the single source of
   truth for the pinned `cloudflared` version and per-target SHA256.
6. **Linux secrets:** hard-require a Secret Service provider (gnome-keyring or
   equivalent). No file-based fallback.
7. **Repository is public.** The Tauri updater downloads release assets over an
   unauthenticated endpoint; private-repo release assets return 401/404 to the
   updater. The repo holds no secrets — only Cloudflare tunnel URLs are exposed at
   runtime, and all credentials live in GitHub Secrets + the OS keyring, never in
   the repo. Making the repo public is therefore a direct consequence of choosing
   the GitHub-Releases auto-updater.

## Alternatives Considered

1. **Private repo + auth-header updater shim** — Rejected. Adds token management
   the updater can't natively supply; brittle.
2. **Drop the auto-updater, manual downloads only** — Rejected. Internal users
   benefit from one-launch upgrades; manual updates rot.
3. **Keep RPM** — Rejected (YAGNI). No Fedora/RHEL consumer in MVP.
4. **Cross-compile both macOS targets from `macos-latest`** — Deferred. Native
   `macos-13` + `macos-14` runners are simpler today; revisit on runner
   deprecation.

## Consequences

Positive:

- One `git tag v*.*.*` produces 14 release assets across all four platforms.
- Self-updating clients via signed `latest.json`.
- Sidecar fetch + SHA256 verification works identically on every runner.

Tradeoffs:

- Unsigned artifacts trigger Gatekeeper / SmartScreen warnings (documented in
  `README.md`).
- The repository must be public for the updater endpoint to resolve.
- macOS `.tgz` sidecar assets publish the *extracted-binary* SHA256, not the
  archive hash — verification must extract first (see Phase 2).
- `macos-13` runner deprecation (expected late 2026) will force a migration.

## Follow-Up

- Track GitHub runner deprecation announcements for `macos-13`.
- Rotate the minisign keypair by issuing a new key + updating `pubkey`; old
  releases remain verifiable by the old key.
- If Fedora/RHEL demand appears, add an RPM target in a follow-up decision.
