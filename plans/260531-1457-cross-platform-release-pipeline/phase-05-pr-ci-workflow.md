---
phase: 5
title: "PR CI workflow"
status: complete
priority: P2
effort: "0.25d"
dependencies: [4]
---

# Phase 5: PR CI workflow

## Overview

Add `.github/workflows/ci.yml` that runs compile + lint + tests on every PR and push to master across the 4-OS matrix. No artifact upload, no signing — pure gate. Cheaper than `release.yml` (no bundle), runs on every commit.

## Requirements

- Functional:
  - Triggers on `pull_request` (any branch) and `push` to `master`.
  - Same 4-runner matrix as Phase 4 but with `tauri build --no-bundle` instead of full bundle.
  - Each job runs: lint (`npm run lint`), frontend tests (`npm test`), Rust tests (`cargo test`), Rust clippy (`cargo clippy --all-targets -- -D warnings`), `tauri build --no-bundle`.
  - Sidecar download runs but verify-only (no real bundle, just to ensure script works on each OS).
  - Failing on any job blocks PR merge (configure branch protection separately — out of plan scope).
- Non-functional:
  - Cargo + npm cache active.
  - Job time budget: ≤ 15 min per OS.
  - `actionlint` clean.
  - No secrets used (no signing, no GH auth tokens beyond `GITHUB_TOKEN`).

## Architecture

```text
PR open / push master
  |
  v
matrix: 4 entries (same as release.yml)
  |
  v (per job)
checkout -> setup -> apt(linux) -> npm ci -> lint -> npm test -> download-sidecar -> verify-sidecar
                                                               -> cargo test -> cargo clippy -> tauri build --no-bundle
```

## Related Code Files

- Create: `.github/workflows/ci.yml`
- Reference: `package.json` scripts (`lint`, `test`, `download-sidecar`, `verify-sidecar`)

## Implementation Steps (TDD)

### Red

1. Extend `scripts/test/workflow.test.mjs` (created Phase 4) with:
   - `.github/workflows/ci.yml` parses; `actionlint` clean.
   - `on.pull_request` present; `on.push.branches` includes `master`.
   - Matrix shape identical to release.yml `matrix.include`.
   - Steps include: `npm run lint`, `npm test`, `cargo test`, `cargo clippy`, `tauri build --no-bundle` (or `cargo tauri build --no-bundle`).
   - NO `tauri-action` usage; NO `TAURI_SIGNING_PRIVATE_KEY` reference.
   - NO `releaseDraft` / `releaseName` keywords.
2. `npm run test:scripts` — must fail.

### Green

3. Write `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on:
     pull_request:
     push:
       branches: [master]
   concurrency:
     group: ci-${{ github.ref }}
     cancel-in-progress: true
   jobs:
     check:
       strategy:
         fail-fast: false
         matrix:
           include:
             - { os: macos-14,       target: aarch64-apple-darwin }
             - { os: macos-13,       target: x86_64-apple-darwin }
             - { os: ubuntu-22.04,   target: x86_64-unknown-linux-gnu }
             - { os: windows-latest, target: x86_64-pc-windows-msvc }
       runs-on: ${{ matrix.os }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: 'npm' }
         - uses: dtolnay/rust-toolchain@stable
           with: { targets: ${{ matrix.target }}, components: clippy }
         - uses: Swatinem/rust-cache@v2
           with: { workspaces: 'src-tauri' }
         - if: matrix.os == 'ubuntu-22.04'
           run: |
             sudo apt-get update
             sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
               libayatana-appindicator3-dev librsvg2-dev
         - run: npm ci
         - run: npm run lint
         - run: npm test
         - run: npm run download-sidecar -- --target ${{ matrix.target }}
         - run: npm run verify-sidecar -- --target ${{ matrix.target }}
         - run: cargo test --manifest-path src-tauri/Cargo.toml
         - run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
         - run: npm run tauri build -- --no-bundle --target ${{ matrix.target }}
   ```
4. `cancel-in-progress: true` here (newer commit cancels older PR runs to save minutes — opposite of release.yml).
5. `npm run test:scripts` — green.
6. Open a PR or push to a test branch; observe 4 jobs, all green.

### Refactor

7. Factor common steps with a composite action `.github/actions/setup-build/action.yml` if duplication grows large. **Defer** unless `release.yml` and `ci.yml` setup blocks both grow > 6 steps; otherwise YAGNI.
8. Add step names for clarity.

### Verify

9. `actionlint` green on both workflows.
10. PR build green on all 4 OS.
11. `npm run test:scripts` green.

## Success Criteria

- [ ] `ci.yml` parses cleanly; `actionlint` clean
- [ ] Triggers on PR + push master
- [ ] 4 matrix entries match release.yml shape
- [ ] Linux job installs system packages
- [ ] All 5 checks run: lint, npm test, cargo test, cargo clippy, tauri build --no-bundle
- [ ] No signing secrets referenced
- [ ] `cancel-in-progress: true` (cheaper PR runs)
- [ ] Test PR shows all 4 OS green within ≤ 15 min/job

## Risk Assessment

- **Risk:** `cargo test` flakiness on macOS Intel (older runner). **Mitigation:** rerun once; if persistent, narrow to specific test and file an issue.
- **Risk:** PR-spam exhausting GH Actions free minutes (4 OS × 15 min × N PRs). **Mitigation:** internal team only; `cancel-in-progress: true` already mitigates; if needed, reduce CI matrix to 2 OS (Linux + Windows) and let release.yml cover the rest. Defer until felt.
- **Risk:** `npm run lint` covers TS/React only — Rust lint is via clippy, separate step. Ensure both gates run.
- **Risk:** `tauri build --no-bundle` may still need `bundle.targets` set. **Mitigation:** Tauri honors `--no-bundle` regardless; verified during Phase 3.
