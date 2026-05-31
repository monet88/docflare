---
title: "Cross-platform release pipeline (TDD)"
description: "GH Actions matrix builds Win x64, macOS Intel+Apple Silicon, Linux x64. Tauri auto-updater via GH Releases. No code-signing. Internal distribution."
status: in_progress
priority: P1
branch: "master"
tags: [ci, release, tauri, cross-platform, sidecar, updater, tdd]
blockedBy: []
blocks: []
created: "2026-05-31T08:03:50.350Z"
createdBy: "ck:plan"
source: skill
mode: tdd
effort: "~3d"
---

# Cross-platform release pipeline (TDD)

## Overview

CI matrix that produces 14 release assets (8 installer/payload files + 5 `.sig` + merged `latest.json`) across Win x64, macOS Intel + Apple Silicon, Linux x64, on every git tag — matching ProxyPal release shape (minus RPM). Tests-first: each phase writes failing assertion(s) before code.

**Source design:** [`docs/superpowers/specs/2026-05-31-cross-platform-release-pipeline-design.md`](../../docs/superpowers/specs/2026-05-31-cross-platform-release-pipeline-design.md)

## Locked Decisions

1. Distribution: CI matrix, no code-signing.
2. Targets: `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`.
3. Updater: Tauri minisign + GH Releases CDN.
4. Bundles: dmg+app (mac), nsis+portable.zip (win), deb+appimage (linux). No RPM.
5. Linux secrets: hard-require Secret Service. No fallback.
6. CI tool: `tauri-apps/tauri-action@v0`.
7. Sidecar: 4 binaries in `src-tauri/binaries/`, Tauri target-triple naming.

## Artifact Matrix (per release)

| File | Bundle | Runner | Updater sig |
|---|---|---|---|
| `Docflare_X.Y.Z_aarch64.dmg` | dmg | macos-14 | – |
| `Docflare_aarch64.app.tar.gz(.sig)` | app | macos-14 | yes |
| `Docflare_X.Y.Z_x64.dmg` | dmg | macos-13 | – |
| `Docflare_x64.app.tar.gz(.sig)` | app | macos-13 | yes |
| `Docflare_X.Y.Z_x64-setup.exe(.sig)` | nsis | windows-latest | yes |
| `Docflare_v.X.Y.Z_x64_portable.zip` | custom | windows-latest | – |
| `Docflare_X.Y.Z_amd64.deb(.sig)` | deb | ubuntu-22.04 | yes |
| `Docflare_X.Y.Z_amd64.AppImage(.sig)` | appimage | ubuntu-22.04 | yes |
| `latest.json` (merged, 4 platform keys) | aggregate-updater job | ubuntu-22.04 | – |

**Total: 14 release assets** — 8 installer/payload (2 dmg, 2 app.tar.gz, 1 exe, 1 portable.zip, 1 deb, 1 AppImage) + 5 `.sig` (2 app.tar.gz, exe, deb, AppImage) + 1 `latest.json`. The dmg files and portable.zip carry no `.sig`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Docs and ADR](./phase-01-docs-and-adr.md) | ✅ Complete |
| 2 | [Sidecar manifest and scripts](./phase-02-sidecar-manifest-and-scripts.md) | ✅ Complete |
| 3 | [Tauri config and updater key](./phase-03-tauri-config-and-updater-key.md) | ✅ Complete (icons generated; deb bundle verified; GH Secrets pending user) |
| 4 | [Release workflow](./phase-04-release-workflow.md) | ✅ Complete (actionlint-clean; awaits tag dry-run) |
| 5 | [PR CI workflow](./phase-05-pr-ci-workflow.md) | ✅ Complete (actionlint-clean) |
| 6 | [Portable ZIP and dry-run release](./phase-06-portable-zip-and-dry-run-release.md) | ⏸ Awaits GH Secrets + tag push + CI runners |

## Implementation Status (2026-05-31)

**Done & verified locally:**
- Phase 1: ADR 0007 + cross-platform doc edits; `docs.test.mjs` green.
- Phase 2: `sidecar-manifest.json` (real `2026.5.2` hashes), `download-sidecar.mjs`,
  `verify-sidecar.mjs`, `lib/manifest.mjs`. **Live-verified** all 4 binaries
  download + hash-match (incl. macOS extract-then-hash); tamper test exits non-zero.
- Phase 3 (code): `tauri.conf.json` bundle+updater, `updater:default` capability,
  `tauri-plugin-updater` registered, minisign keypair generated (pubkey committed,
  private key in `~/.tauri/`). `cargo check`/`clippy`/`build --no-bundle` green.
- Phase 4/5: `release.yml` + `ci.yml`, `merge-updater-manifest.mjs`. **actionlint-clean.**
- 43 script tests + 19 vitest + 38 Rust tests + lint all green.

**Caught & fixed during execution (deviations from plan):**
- GitHub release-asset host moved to `release-assets.githubusercontent.com` —
  added to download-sidecar host allowlist (plan's allowlist was stale).
- `macos-13` runner **retired by GitHub** — migrated to `macos-15-intel` (native
  Intel runner; plan's documented mitigation path). Applies to both workflows.
- Code review caught a critical `verify-sidecar --all`/`--target` precedence
  collision; fixed + regression test added; `test:scripts` added to `ci.yml`.

**Resolved this session:**
- Phase 3 icons: placeholder 1024×1024 logo generated (`src-tauri/icons/logo-source.svg`
  → `logo-1024.png`), full icon set built via `npm run tauri icon`. Real Linux `.deb`
  bundle produced + inspected (cloudflared sidecar + binary + icons all packaged).
  User will swap the logo later.
- Repo wired: `origin = https://github.com/monet88/docflare.git`, confirmed **PUBLIC**
  (correct for updater). `<owner>` in `tauri.conf.json` = `monet88` is correct.
- `bundle.icon` array added to `tauri.conf.json` (bundling needs it explicitly).

**Still blocked on user:**
- GH Secrets `TAURI_SIGNING_PRIVATE_KEY` (contents of `~/.tauri/docflare.key`) +
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (`docflare-updater-2026`).
- Push the repo to `origin` (currently empty remote) so workflows + updater endpoint go live.
- Phase 6 tag dry-run (`v0.1.0-rc.1`) + cross-OS smoke + updater happy-path —
  require GH Secrets + pushed repo + CI runners.

## Phase Dependency Chain

```text
P1 Docs + ADR  (no code; reviewable contract)
  -> P2 Sidecar manifest + scripts (TDD: hash + naming)
     -> P3 Tauri config + minisign keypair (TDD: schema + bundle)
        -> P4 Release workflow (TDD: matrix + artifact names)
           -> P5 PR/CI workflow (TDD: compile + test gate)
              -> P6 Win portable ZIP + dry-run release (TDD: artifact count + updater sig)
```

## Touchpoints

**Create:**
- `.github/workflows/release.yml`
- `.github/workflows/ci.yml`
- `scripts/download-sidecar.mjs`
- `scripts/verify-sidecar.mjs`
- `scripts/sidecar-manifest.json`
- `scripts/merge-updater-manifest.mjs` — merge per-target `latest.json` fragments into one manifest
- `scripts/lib/manifest.mjs` — shared parser + hash-source resolver
- `scripts/test/sidecar.test.mjs`, `scripts/test/workflow.test.mjs`, `scripts/test/merge-updater.test.mjs`, `scripts/test/tauri-config.test.mjs`, `scripts/test/release-assets.test.mjs`, `scripts/test/docs.test.mjs`
- `src-tauri/icons/icon.icns` + `icon.ico` + sized PNGs — via `npm run tauri icon` (replaces 70-byte placeholder)
- `docs/decisions/0007-cross-platform-release-pipeline.md`

**Modify:**
- `src-tauri/tauri.conf.json` — bundle.active true, targets, externalBin, updater plugin, linux deps
- `src-tauri/Cargo.toml` — add `tauri-plugin-updater`
- `src-tauri/src/lib.rs` — register updater plugin (after `Builder::default()`, before `.invoke_handler()`; no `.setup()` exists)
- `src-tauri/capabilities/default.json` — add `updater:default` permission
- `docs/product/overview.md` — drop Windows-only
- `docs/product/non-functional-requirements.md` — full manifest, replace .ps1 reference
- `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md` — add cfg(target_os) note
- `README.md` — releases section, Gatekeeper note, Linux Secret Service note
- `package.json` — add `download-sidecar`, `verify-sidecar`, `test:scripts` npm scripts
- `.gitignore` — `*.key`, `*.key.pwd`, `src-tauri/binaries/cloudflared*`

**Delete:** none.

## Out of Scope

- Code-signing (mac notarization / Win cert)
- RPM bundle target
- Linux file-fallback secret store
- Implementing operational-flow Phase 3 Rust code (only convention-note)
- arm64 for Win/Linux
- Custom updater server (GH Releases sufficient)
- Refactor of existing onboarding code
- Implementing tray, autostart, route management features

## Dependencies

- Existing onboarding plan (`260529-1929-multi-profile-onboarding`) is `completed`, no conflict.
- `260529-1604-tauri-scaffold-epic-1-onboarding` is `pending` but predates this plan; touches different files (no overlap).
- `260529-2125-route-management` and `260529-1446-cf-tunnel-operational-flow` are independent feature work; this plan only adds a `cfg(target_os)` note to phase-03 of the operational-flow plan, no behaviour change.

No `blockedBy` / `blocks` relationships needed.

## TDD Discipline

For each phase: **Red** (failing test) → **Green** (minimum change) → **Refactor** → **Verify**.

Tests for non-code artifacts:

- `actionlint` for `.github/workflows/*.yml`
- JSON schema validation for `sidecar-manifest.json`
- `node --test scripts/test/*.test.mjs` for download/verify scripts
- Markdown structure asserts for ADR + edited docs

## Top-Level Acceptance

- [ ] Tag `v0.1.0` produces 14 release assets (incl. merged `latest.json`) in GH draft release
- [ ] All 4 build jobs + `aggregate-updater` job green
- [ ] Merged `latest.json` has 4 platform entries with valid minisign signatures (verified post-merge)
- [ ] PR build green on all 4 OS via `ci.yml`
- [ ] Sidecar SHA256 verify passes in all 4 jobs
- [ ] Manual smoke per OS: install → onboarding renders → save profile works (or friendly error on headless Linux)
- [ ] Auto-updater happy path: `v0.1.0` → `v0.1.1` upgrade prompt within 1 launch

## Risks

| Risk | Mitigation |
|---|---|
| `macos-13` runner deprecation late 2026 | Track GH announcements; migrate to cross-compile from `macos-latest` |
| AppImage requires FUSE on target distro | README documents `--appimage-extract-and-run` |
| Linux user without gnome-keyring | Hard-require chosen; README lists deps; backend friendly error |
| macOS Gatekeeper blocks unsigned app | README documents `xattr -cr /Applications/Docflare.app` |
| Win SmartScreen warning | Accepted for internal use; documented |
| GH Actions Rust release OOM | `CARGO_PROFILE_RELEASE_LTO=thin` + sccache |
| Cloudflare cloudflared release breaks naming | Manifest single source of truth; fail-fast on 404 / hash mismatch |
| Minisign key leak | GH Secrets only; rotate by new key + pubkey update |
| Minisign key loss | Local + 1 teammate backup; old releases verifiable by old key |

## Next Gates

- `/ck:plan validate` — critical-questions interview before implementation
- `/ck:plan red-team` — adversarial review (supply-chain on cloudflared, secret leak in CI)
- `/ck:cook plans/260531-1457-cross-platform-release-pipeline/plan.md` — execute phase by phase
- `/ck:journal` — record decisions + outcomes

## Red Team Review

### Session — 2026-05-31
**Findings:** 8 (7 accepted, 1 rejected/downgraded)
**Severity breakdown:** 2 Critical, 3 High, 3 Medium
**Report:** [`reports/from-code-reviewer-to-planner-red-team-cross-platform-release-pipeline-review-report.md`](./reports/from-code-reviewer-to-planner-red-team-cross-platform-release-pipeline-review-report.md)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `latest.json` overwritten across matrix jobs — updater breaks for 3/4 platforms | Critical | Accept | Phase 4 (added `aggregate-updater` job + `merge-updater-manifest.mjs`) |
| 2 | macOS sidecar SHA256 fails — must hash extracted binary not `.tgz` | Critical | Accept | Phase 2 (`hashOf` field, extract-then-hash for tgz) |
| 3 | Bundle fails — only 70-byte `icon.png`, no `.icns`/`.ico` | High | Accept | Phase 3 (generate icon set via `npm run tauri icon`) |
| 4 | Plan referenced non-existent `.setup()` anchor in `lib.rs` | High | Accept | Phase 3 (real chain documented) |
| 5 | Updater capability `updater:default` never added | High | Accept | Phase 3 (capabilities/default.json edit) |
| 6 | Artifact count contradiction (9 vs 14 vs 15) | Medium | Accept | plan.md + Phase 4 + Phase 6 (standardized on 14) |
| 7 | Pinned cloudflared `2026.5.1` superseded by `2026.5.2` | Medium | Accept | Phase 2 (pinned 2026.5.2 + real hashes) |
| 8 | Phase-1 standalone `docs.test.mjs` is TDD gold-plating | Medium | Reject (downgrade) | Kept as-is — user's `--tdd` choice; not auto-cut |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03, phase-04, phase-05, phase-06
- Decision deltas checked: 7 (aggregate-updater job, hashOf semantics, cloudflared 2026.5.2, icon set, lib.rs chain, updater capability, 14-asset count)
- Reconciled stale references: 6 (plan.md overview "9 artifacts" → 14; plan.md acceptance; artifact matrix table; Phase 4 risk note; Phase 6 overview/requirements/success/verify; touchpoints expanded)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-05-31
**Trigger:** `/ck:plan validate` after red-team edits applied
**Questions asked:** 4
**Verification:** Skipped re-verification per validate Step 2.5 guard (Red Team Review section already carries codebase + live-API evidence). No `[UNVERIFIED]` tags remain.

#### Questions & Answers

1. **[Risk]** Private repo breaks the Tauri updater (GitHub private release assets need auth the updater can't supply). How to host releases?
   - Options: (a) Make repo public | (b) Private + auth-header updater | (c) Drop auto-updater | (d) Private repo + public mirror
   - **Answer:** (a) Make repo public
   - **Rationale:** User states repo holds nothing sensitive — it only exposes Cloudflare tunnel URLs. Public repo makes the updater endpoint work as designed with zero token management. Secrets remain in GH Secrets + OS keyring, never in the repo.

2. **[Assumption]** CI `gh release upload` needs `contents: write`. Add a `permissions:` block?
   - Options: (a) Add `permissions: { contents: write }` to release jobs | (b) Rely on repo defaults
   - **Answer:** (a) Add explicit `permissions: contents: write`
   - **Rationale:** Explicit least-privilege permission block avoids "Resource not accessible by integration" failures on hardened defaults.

3. **[Scope]** Icon source asset missing. Where does the 1024×1024 logo come from?
   - Options: (a) User provides real logo PNG | (b) Generate placeholder | (c) Reuse onboarding screenshot
   - **Answer:** (a) User provides 1024×1024 logo before Phase 3
   - **Rationale:** Real branding asset; avoids shipping a throwaway icon. Phase 3 blocks on this input.

4. **[Assumption]** `<owner>` in updater endpoint unresolved (no git remote). When fixed?
   - Options: (a) Create + push public GH repo before Phase 3 | (b) Placeholder, fix before Phase 6 dry-run
   - **Answer:** (a) Create + push public GH repo before Phase 3
   - **Rationale:** Endpoint + minisign pubkey land correctly the first time; no late churn before dry-run.

#### Confirmed Decisions
- Repo visibility: **public** — updater endpoint works without auth (Q1).
- CI: add `permissions: { contents: write }` to `release.yml` (Q2).
- Icons: user supplies 1024×1024 logo PNG; Phase 3 has a hard prerequisite (Q3).
- Remote: public GH repo created + pushed before Phase 3; `<owner>` resolved early (Q4).

#### Action Items
- [ ] Phase 3: add explicit prerequisite — public GH repo pushed + 1024×1024 logo supplied before phase start.
- [ ] Phase 3: replace `<owner>` with real `owner/name` (no longer a deferred TODO).
- [ ] Phase 4: add `permissions: { contents: write }` to both `build` and `aggregate-updater` jobs.
- [ ] README/ADR: note repo is public-by-decision (updater requires public release assets).

#### Impact on Phases
- **Phase 3:** new "Prerequisites" note (public repo + logo); `<owner>` resolved not deferred.
- **Phase 4:** workflow YAML gains a `permissions` block.
- **Phase 1 (ADR 0007):** record "repo public" as an explicit consequence of choosing the updater.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03, phase-04, phase-05, phase-06
- Decision deltas checked: 4 (public repo, CI permissions, logo prerequisite, early `<owner>` resolution)
- Reconciled stale references: 3 (Phase 3 prerequisites + `<owner>` deferral text; Phase 4 permissions; ADR consequence note in Phase 1)
- Unresolved contradictions: 0
