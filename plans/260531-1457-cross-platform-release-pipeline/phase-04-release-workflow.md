---
phase: 4
title: "Release workflow"
status: complete
priority: P1
effort: "0.75d"
dependencies: [3]
---

# Phase 4: Release workflow

## Overview

Build `.github/workflows/release.yml` — a 4-job build matrix (Win, Linux, mac aarch64, mac x64) that downloads sidecar and runs `tauri-action` to bundle and sign per platform, **plus a 5th aggregation job** that merges the four per-target `latest.json` fragments into a single multi-platform `latest.json` and uploads it to the draft GitHub Release. Triggered by tag push or manual dispatch.

## Requirements

- Functional:
  - Workflow triggers on `push` of tags matching `v*.*.*` and on `workflow_dispatch`.
  - 4 matrix entries, runners: `macos-14`, `macos-13`, `ubuntu-22.04`, `windows-latest`.
  - Each job: checkout → setup Node 20 + Rust stable + matrix target → (Linux only) apt deps → `npm ci` → `npm run download-sidecar -- --target <triple>` → `npm run verify-sidecar -- --target <triple>` → `tauri-apps/tauri-action@v0` with bundles per matrix.
  - `tauri-action` env carries `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from GH Secrets.
  - `tauri-action` `releaseDraft: true` so the maintainer can review and publish manually.
  - **`latest.json` aggregation (CRITICAL):** each matrix job's `tauri-action` produces a `latest.json` containing ONLY that job's target(s). Four parallel jobs uploading to the same release would overwrite each other, leaving a manifest with 1–2 platforms and breaking the updater for the rest. A dedicated `aggregate-updater` job (runs `needs: build`) downloads each job's `latest.json` (via job artifacts), deep-merges the `platforms` maps into one manifest covering all 4 platform keys (`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `windows-x86_64`), and uploads the single merged `latest.json` to the draft release with `--clobber`.
  - Each build job uploads its own `latest.json` as a workflow artifact (not directly to the release) so the aggregator can merge them; per-target installers + `.sig` files still attach to the release directly via `tauri-action`.
  - Concurrency: `release-${{ github.ref }}` group, `cancel-in-progress: false` (don't cancel a tagged release mid-flight).
- Non-functional:
  - Each job ≤ 30 minutes.
  - Cargo cache + npm cache used (`actions/cache@v4`).
  - `actionlint` clean.
  - Linux runner `ubuntu-22.04` (NOT `ubuntu-latest`) — pinned to avoid 24.04 webkit2gtk breakage.
  - **`permissions: { contents: write }`** declared (workflow- or job-level) so `tauri-action` and the aggregator's `gh release upload` can write release assets. Without it, hardened-default repos fail with "Resource not accessible by integration". <!-- Updated: Validation Session 1 -->
  - Repo is **public** (Validation Session 1) — release assets are publicly downloadable so the updater endpoint needs no auth token.

## Architecture

```text
push tag v* OR workflow_dispatch
  |
  v
matrix: 4 build jobs
  |
  +-- macos-14    aarch64-apple-darwin       app,dmg
  +-- macos-13    x86_64-apple-darwin        app,dmg
  +-- ubuntu-22.04 x86_64-unknown-linux-gnu  deb,appimage
  +-- windows-latest x86_64-pc-windows-msvc  nsis
  |
  v (per build job)
checkout -> setup -> apt(if linux) -> npm ci -> download-sidecar -> verify -> tauri-action
                                                                              |
                                                          +-------------------+--------------------+
                                                          v                                        v
                                          draft GH release: attach installers + .sig     upload latest.json AS ARTIFACT
                                                                                                   |
  +------------------------------------------------------------------------------------------------+
  v
aggregate-updater job (needs: all 4 build jobs)
  -> download 4 latest.json artifacts
  -> deep-merge platforms{} into one manifest (4 platform keys)
  -> gh release upload <tag> latest.json --clobber
```

Each build job's `tauri-action` produces a single-platform `latest.json`; the aggregator merges them so the published manifest covers all 4 platforms. Portable ZIP step is added in Phase 6 (Windows-only post-build step).

## Related Code Files

- Create: `.github/workflows/release.yml`
- Create: `scripts/merge-updater-manifest.mjs` — merges per-target `latest.json` fragments into one multi-platform manifest (with a `scripts/test/merge-updater.test.mjs` case)
- Modify: none else (workflow consumes Phase 1-3 outputs)
- Reference: `scripts/sidecar-manifest.json`, `scripts/download-sidecar.mjs`, `src-tauri/tauri.conf.json`

## Implementation Steps (TDD)

### Red

1. Add to `scripts/test/workflow.test.mjs`:
   - `actionlint` exits 0 against `.github/workflows/release.yml`.
   - YAML parses; `on.push.tags` includes `v*.*.*`.
   - `jobs.build.strategy.matrix.include` has exactly 4 entries with required keys (`os`, `target`, `bundles`).
   - Each matrix entry has correct `bundles` value per target table.
   - Job uses `tauri-apps/tauri-action@v0` (pinned major) and references `TAURI_SIGNING_PRIVATE_KEY` env.
   - Job uses `actions/checkout@v4`, `actions/setup-node@v4`, `dtolnay/rust-toolchain@stable`.
   - Linux job runs `apt-get install` for the 5 required packages (webkit2gtk-4.1, gtk-3, libsoup-3, libayatana-appindicator3, librsvg2).
   - `concurrency.group` is `release-${{ github.ref }}`.
   - An `aggregate-updater` job exists with `needs: build`, downloads `latest.json` artifacts, and runs `gh release upload` for a merged `latest.json`.
   - Build jobs upload `latest.json` as a workflow artifact and set `tauri-action` `includeUpdaterJson` appropriately so per-job manifests are retrievable.
   - Workflow declares `permissions: { contents: write }` (workflow-level or on both release jobs).
2. `npm run test:scripts` — must fail.

### Green

3. Install `actionlint` locally OR rely on `rhysd/actionlint` GH action; for the test, document a `npx --package actionlint actionlint` fallback. (Acceptable: skip actionlint locally if not installed; CI runs it via action.)
4. Write `.github/workflows/release.yml`:
   ```yaml
   name: Release
   on:
     push:
       tags: ['v*.*.*']
     workflow_dispatch:
   permissions:
     contents: write
   concurrency:
     group: release-${{ github.ref }}
     cancel-in-progress: false
   jobs:
     build:
       strategy:
         fail-fast: false
         matrix:
           include:
             - { os: macos-14,       target: aarch64-apple-darwin,        bundles: app,dmg }
             - { os: macos-13,       target: x86_64-apple-darwin,         bundles: app,dmg }
             - { os: ubuntu-22.04,   target: x86_64-unknown-linux-gnu,    bundles: deb,appimage }
             - { os: windows-latest, target: x86_64-pc-windows-msvc,      bundles: nsis }
       runs-on: ${{ matrix.os }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: 'npm' }
         - uses: dtolnay/rust-toolchain@stable
           with: { targets: ${{ matrix.target }} }
         - uses: Swatinem/rust-cache@v2
           with: { workspaces: 'src-tauri' }
         - if: matrix.os == 'ubuntu-22.04'
           run: |
             sudo apt-get update
             sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
               libayatana-appindicator3-dev librsvg2-dev
         - run: npm ci
         - run: npm run download-sidecar -- --target ${{ matrix.target }}
         - run: npm run verify-sidecar -- --target ${{ matrix.target }}
         - uses: tauri-apps/tauri-action@v0
           env:
             TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
             TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
           with:
             tagName: ${{ github.ref_name }}
             releaseName: 'Docflare ${{ github.ref_name }}'
             releaseDraft: true
             prerelease: false
             args: --target ${{ matrix.target }} --bundles ${{ matrix.bundles }}
         # Upload this job's single-platform latest.json as an artifact for the aggregator.
         # (tauri-action writes latest.json into the bundle output dir.)
         - name: Stage per-target updater manifest
           shell: bash
           run: |
             mkdir -p updater-out
             # Tauri v2 emits <productName>.app.tar.gz + latest.json under target/<triple>/release/bundle/
             found=$(find src-tauri/target -name 'latest.json' -path '*release*' | head -n1)
             test -n "$found" || { echo "latest.json not found"; exit 1; }
             cp "$found" "updater-out/latest-${{ matrix.target }}.json"
         - uses: actions/upload-artifact@v4
           with:
             name: updater-${{ matrix.target }}
             path: updater-out/latest-${{ matrix.target }}.json
             if-no-files-found: error

     aggregate-updater:
       needs: build
       runs-on: ubuntu-22.04
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - uses: actions/download-artifact@v4
           with: { pattern: 'updater-*', path: updater-fragments, merge-multiple: true }
         - name: Merge per-target latest.json into one manifest
           run: node scripts/merge-updater-manifest.mjs updater-fragments latest.json
         - name: Upload merged latest.json to the draft release
           env:
             GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           run: gh release upload "${{ github.ref_name }}" latest.json --clobber
   ```
   The merge script (`scripts/merge-updater-manifest.mjs`, created in this phase) reads all `latest-*.json` fragments, asserts the `version` field is identical across them, deep-merges their `platforms` objects, and writes one manifest with all 4 platform keys. It fails if fewer than 4 platform keys result (guards against a silently-missing platform).
5. Add LTO env tweak if release-mode RAM is tight:
   ```yaml
   env:
     CARGO_PROFILE_RELEASE_LTO: thin
   ```
6. `npm run test:scripts` — green.
7. Push a `release/dry-run` branch with workflow + use `workflow_dispatch` to test 1 matrix entry (Linux first). Iterate.

### Refactor

8. Extract repeated env into job-level `env:` block.
9. Add a `name:` to each step for cleaner GH UI.
10. Pin action SHAs (defer to Phase 6 hardening; v-tag pinning is acceptable for now).

### Verify

11. `actionlint .github/workflows/release.yml` (in CI) green.
12. Manual `workflow_dispatch` from GH UI on a non-tagged commit: 4 build jobs spawn, Linux completes, produces `.deb` + `.AppImage` + `.sig` in draft release; `aggregate-updater` runs after and uploads a merged `latest.json`.
13. Inspect the published `latest.json`: confirm it has all 4 platform keys (`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `windows-x86_64`), not just the last job's.
14. `npm run test:scripts` green (includes `merge-updater.test.mjs`).

## Success Criteria

- [ ] `release.yml` parses cleanly; `actionlint` clean
- [ ] 4 build matrix entries with correct OS / target / bundles mapping
- [ ] `aggregate-updater` job merges per-target manifests and uploads one `latest.json` with all 4 platform keys
- [ ] Workflow declares `permissions: { contents: write }`
- [ ] Linux job installs the 5 system packages
- [ ] `tauri-action` receives both signing secrets via env
- [ ] `releaseDraft: true` (artifacts go to draft, not auto-publish)
- [ ] Concurrency group set to `release-${{ github.ref }}` with `cancel-in-progress: false`
- [ ] Manual dispatch on Linux job produces signed `.deb` + `.AppImage`; aggregator produces merged `latest.json`
- [ ] Published `latest.json` contains 4 platform keys (verified, not assumed)
- [ ] Cargo cache + npm cache active

## Risk Assessment

- **Risk:** `macos-13` runner image deprecation — GH typically gives 6-month warning. **Mitigation:** track GH announcements; migration path = drop x64 mac OR cross-compile from `macos-latest`.
- **Risk:** webkit2gtk-4.1-dev not present on `ubuntu-latest` (24.04). **Mitigation:** pin `ubuntu-22.04` until Tauri v2 supports 24.04 webkit2gtk-4.1 cleanly.
- **Risk:** `tauri-action@v0` major-tag floats. **Mitigation:** acceptable for now; revisit if a breaking minor lands. Pin SHA later if needed.
- **Risk:** Secret leak via `set -x` or echo. **Mitigation:** never `echo` env; tauri-action reads via env, not args; GH masks secret values in logs automatically.
- **Risk (verified — was the biggest bug):** `tauri-action` writes a single-platform `latest.json` per job; 4 parallel jobs uploading to the same release overwrite each other, leaving a manifest missing 2–3 platforms and silently breaking the updater for those users. **Mitigation:** build jobs upload `latest.json` as artifacts only; the `aggregate-updater` job deep-merges all 4 into one manifest and fails if fewer than 4 platform keys result.
- **Risk:** Cargo build OOM on `ubuntu-22.04` 7GB runner. **Mitigation:** `LTO=thin` + Swatinem cache; fall back to single-codegen-unit only if seen.
