# Cross-Platform Release Pipeline Design

Date: 2026-05-31
Status: Approved (brainstorm output, ready for /ck:plan --tdd)
Source (current contract): docs/product/overview.md, non-functional-requirements.md, plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md
Reference target: https://github.com/heyhuynhgiabuu/proxypal/releases/tag/v0.4.37
Brainstorm session: 260531-1457

## Summary

Make Docflare buildable and releasable for Windows x64, macOS (Intel + Apple Silicon), and Linux x64 from GitHub Actions CI without code-signing. Match ProxyPal release shape (Tauri v2 + minisign updater + GH Releases CDN), but trim RPM out and skip Linux secret-store fallback.

Internal-only distribution. No Apple Developer certificate, no Windows code-sign cert. Users accept Gatekeeper / SmartScreen warnings; macOS receives `xattr -cr` workaround in README.

## Problem Statement

Current Docflare contract is Windows-only:

- `docs/product/overview.md` declares "Cloudflare Local Tunnel Manager for Windows".
- `docs/product/non-functional-requirements.md` ships `windowsX64Sha256` only and references PowerShell `download-sidecar.ps1`.
- `tauri.conf.json` has `bundle.active: false`, no updater, no platform bundle targets.
- Phase 3 plan assumes Windows process flags (CREATE_NO_WINDOW) without `cfg(target_os)` gates.
- No CI / release workflow exists.

Linux contributors and macOS testers cannot install pre-built artifacts; every contributor must build from source. README already lists deps for all 3 OS, but no path exists from `git tag` to downloadable installers.

## Requirements (locked)

| Item | Decision |
|---|---|
| Distribution mode | (1c) CI build matrix, no signing |
| Platforms | Win x64, macOS aarch64 + x86_64, Linux x86_64 |
| Auto-updater | Yes (minisign `latest.json` + `.sig` per asset) |
| Win portable ZIP | Yes |
| Linux RPM | No (deb + AppImage only) |
| Linux secrets | Hard-require Secret Service; no file fallback |
| CI orchestrator | `tauri-apps/tauri-action` |
| Effort budget | ~3 days |

### Artifact Matrix (per release, 9 files + 1 manifest)

| File | Bundle | Runner | Purpose |
|---|---|---|---|
| `Docflare_X.Y.Z_aarch64.dmg` | dmg | macos-14 | macOS Apple Silicon installer |
| `Docflare_aarch64.app.tar.gz` + `.sig` | app | macos-14 | macOS aarch64 updater payload |
| `Docflare_X.Y.Z_x64.dmg` | dmg | macos-13 | macOS Intel installer |
| `Docflare_x64.app.tar.gz` + `.sig` | app | macos-13 | macOS x64 updater payload |
| `Docflare_X.Y.Z_x64-setup.exe` + `.sig` | nsis | windows-latest | Win installer + updater |
| `Docflare_v.X.Y.Z_x64_portable.zip` | custom step | windows-latest | Win portable |
| `Docflare_X.Y.Z_amd64.deb` + `.sig` | deb | ubuntu-22.04 | Debian/Ubuntu |
| `Docflare_X.Y.Z_amd64.AppImage` + `.sig` | appimage | ubuntu-22.04 | Distro-agnostic Linux |
| `latest.json` | aggregated | (any) | Tauri updater manifest |

## Evaluated Approaches

### (A) tauri-action + matrix [CHOSEN]

| Pros | Cons |
|---|---|
| Matches ProxyPal 1:1 | Filename convention locked by Tauri |
| Handles minisign + `latest.json` aggregate | Portable ZIP needs custom step |
| Auto-creates draft release | Slightly black-box on failure |
| Maintained by Tauri team | |

### (B) Custom workflow + raw `cargo tauri build`

| Pros | Cons |
|---|---|
| Full filename control | Must script minisign + manifest gen |
| Easier per-step debug | +1 day work |
| | Maintenance cost when Tauri changes format |

### (C) Lean: no updater, no portable, no AppImage

| Pros | Cons |
|---|---|
| ~1 day faster | User must manually re-download for every update |
| | No headless distro support |
| | Doesn't match reference (proxypal) shape |

**Rationale for (A):** internal team still benefits from auto-updater (avoids "are you on the latest version?" messages), and tauri-action gives a 9-artifact set matching proxypal with ~3 days effort vs ~4 days for custom.

## Final Design

### 1. CI workflows

**`.github/workflows/release.yml`** — trigger: push tag `v*` or manual dispatch.

```text
strategy.matrix.include:
  - { os: macos-14,       target: aarch64-apple-darwin,        bundles: app,dmg }
  - { os: macos-13,       target: x86_64-apple-darwin,         bundles: app,dmg }
  - { os: ubuntu-22.04,   target: x86_64-unknown-linux-gnu,    bundles: deb,appimage }
  - { os: windows-latest, target: x86_64-pc-windows-msvc,      bundles: nsis }

steps (per job):
  1. checkout
  2. setup Node 20 + Rust stable + matrix.target
  3. (Linux only) apt: webkit2gtk-4.1, gtk-3, libsoup-3, libayatana-appindicator3, librsvg2
  4. npm ci
  5. node scripts/download-sidecar.mjs --target ${matrix.target}
  6. node scripts/verify-sidecar.mjs --target ${matrix.target}
  7. tauri-apps/tauri-action@v0
       env: TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD
       with: tagName: v__VERSION__, releaseDraft: true,
             args: --target ${matrix.target} --bundles ${matrix.bundles}
  8. (Windows only) custom step: zip dist + sidecar -> portable.zip -> upload via gh CLI
```

**`.github/workflows/ci.yml`** — trigger: PR + push to master. Runs `cargo test`, `npm test`, `npm run lint`, `tauri build --no-bundle` across same matrix. No artifacts uploaded. Pure compile + test gate.

### 2. Sidecar layout

```text
src-tauri/binaries/
  cloudflared-x86_64-pc-windows-msvc.exe
  cloudflared-x86_64-unknown-linux-gnu
  cloudflared-aarch64-apple-darwin
  cloudflared-x86_64-apple-darwin
```

Tauri auto-picks suffix by `--target`. Replaces single Windows binary expectation.

**`scripts/sidecar-manifest.json`** (committed):

```json
{
  "cloudflaredVersion": "2026.5.1",
  "checksums": {
    "x86_64-pc-windows-msvc":     "<sha256>",
    "x86_64-unknown-linux-gnu":   "<sha256>",
    "aarch64-apple-darwin":       "<sha256>",
    "x86_64-apple-darwin":        "<sha256>"
  },
  "downloadUrlTemplate": "https://github.com/cloudflare/cloudflared/releases/download/{version}/{asset}",
  "assetByTarget": {
    "x86_64-pc-windows-msvc":   "cloudflared-windows-amd64.exe",
    "x86_64-unknown-linux-gnu": "cloudflared-linux-amd64",
    "aarch64-apple-darwin":     "cloudflared-darwin-arm64.tgz",
    "x86_64-apple-darwin":      "cloudflared-darwin-amd64.tgz"
  }
}
```

**`scripts/download-sidecar.mjs`** — Node 20+, runs cross-platform, replaces PowerShell `.ps1`. Usage:

```bash
node scripts/download-sidecar.mjs --target <triple>
node scripts/download-sidecar.mjs --all   # local dev convenience
```

Behaviour: download asset for triple → verify SHA256 against manifest → rename to Tauri sidecar convention → place in `src-tauri/binaries/`. Hard-fail on mismatch. macOS assets are tarballs → extract single binary.

**`scripts/verify-sidecar.mjs`** — independent verifier callable post-download or in CI. Pure read-only.

### 3. Rust backend changes (light, no logic rewrite)

| File | Change | Phase |
|---|---|---|
| `src-tauri/src/services/sidecar_resolver.rs` (Phase 3 will create) | Resolve from Tauri `target_triple()` API; no PATH lookup; no hardcoded `.exe` | Note in Phase 3 plan |
| Future `process_spawner.rs` (Phase 3) | `#[cfg(target_os = "windows")]` for `CREATE_NO_WINDOW`; non-Windows path uses unmodified `Command` | Note in Phase 3 plan |
| `src-tauri/Cargo.toml` | No change in this round (keyring 3 already cross-platform) | — |

### 4. `tauri.conf.json` updates

```jsonc
{
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "nsis", "deb", "appimage"],
    "externalBin": ["binaries/cloudflared"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
    "macOS": { "minimumSystemVersion": "10.15" },
    "linux": {
      "deb": {
        "depends": [
          "libwebkit2gtk-4.1-0",
          "libgtk-3-0",
          "libayatana-appindicator3-1"
        ]
      }
    }
  },
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/<owner>/docflare/releases/latest/download/latest.json"
      ],
      "pubkey": "<base64 minisign public key>"
    }
  }
}
```

### 5. Updater key ceremony (one-time)

```bash
npm run tauri signer generate -- -w ~/.tauri/docflare.key
# Public key  -> commit to tauri.conf.json plugins.updater.pubkey
# Private key -> GH Secrets: TAURI_SIGNING_PRIVATE_KEY
# Password    -> GH Secrets: TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# Local backup outside repo. Loss = cannot publish updater-signed releases anymore.
```

### 6. Documentation deltas

| File | Change |
|---|---|
| `docs/decisions/0007-cross-platform-release-pipeline.md` (NEW) | ADR: 4-platform target, no signing, updater via GH Releases, tauri-action chosen, RPM dropped, Linux secret hard-require |
| `docs/product/overview.md` | "for Windows" → "cross-platform desktop"; remove `Target OS: Windows 10/11 x64` line; add macOS + Linux to In-Scope |
| `docs/product/non-functional-requirements.md` | Replace single-arch sidecar block with full manifest; replace `download-sidecar.ps1` reference with `download-sidecar.mjs`; expand performance targets to all OS |
| `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md` | Add note: sidecar resolver uses Tauri target convention; spawn flags via `cfg(target_os)`; no logic rewrite this round |
| `README.md` | Add "Releases" section with download table; add macOS Gatekeeper bypass note (`xattr -cr /Applications/Docflare.app`); add Linux note about Secret Service requirement |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| GH `macos-13` runner deprecation late 2026 | Track GH runner deprecation announcements; migrate to cross-compile from `macos-latest` when needed |
| AppImage requires FUSE on target distro | README documents `--appimage-extract-and-run` fallback |
| Linux user without gnome-keyring → app crashes on profile save | Hard-require already chosen; README lists `gnome-keyring` / `kwallet` as required dep; backend surfaces friendly "Secret Service unavailable" error |
| macOS Gatekeeper blocks unsigned app | README documents `xattr -cr /Applications/Docflare.app` (matches ProxyPal pattern) |
| Windows SmartScreen warning | Accepted for internal use; documented in README |
| GH Actions Rust release build OOM | `CARGO_PROFILE_RELEASE_LTO=thin` + sccache; fallback to default profile if needed |
| Cloudflare cloudflared release breaks asset naming | Manifest is the single source of truth; sidecar download fails fast on 404 or hash mismatch |
| Minisign private key leak | Key in GH Secrets only; rotate by generating new key, updating pubkey in next tauri.conf.json release; old releases remain verifiable by old key |
| Minisign private key loss | Local backup + 1 trusted teammate copy; without it: can publish new releases but old auto-updaters cannot verify them — must publish key rotation note |

## Out of Scope

- macOS Apple Developer signing + notarization
- Windows EV / OV code-sign cert
- RPM build target
- Linux file-based encrypted secret fallback
- Custom auto-update server (GH Releases CDN suffices)
- arm64 for Windows / Linux
- Implementing Phase 3 sidecar resolver Rust code (only convention-note in plan)
- Refactor of any existing onboarding code
- Implementing tray, autostart, route management features (Phases 1-5 in operational-flow plan)

## Success Metrics

- [ ] Tag `v0.1.0` produces 9 release artifacts + `latest.json` in GH draft release.
- [ ] All 4 matrix jobs green on the first dry-run release.
- [ ] `latest.json` validates: 4 platform entries (`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `windows-x86_64`), each with valid signature.
- [ ] PR build (`ci.yml`) passes `cargo test` + `npm test` + lint + `tauri build --no-bundle` on all 4 matrix entries.
- [ ] Sidecar SHA256 verification passes in all 4 jobs.
- [ ] Manual smoke on each OS: install → launch → onboarding screen renders → save profile succeeds (or surfaces friendly error if Secret Service missing on Linux).
- [ ] Auto-updater happy path: install `v0.1.0`, publish `v0.1.1`, app prompts and updates within 1 launch.

## Implementation Order (3-day estimate)

| Day | Tasks |
|---|---|
| **D1** | ADR `0007-*.md`; doc updates (overview, NFR, phase-03 note, README); sidecar manifest + `download-sidecar.mjs` + `verify-sidecar.mjs`; minisign keypair generation; secrets registered in GH |
| **D2** | `release.yml` + `ci.yml`; `tauri.conf.json` updates (bundle, externalBin, updater, linux deps); fill icons in `src-tauri/icons/`; first end-to-end test on Linux runner |
| **D3** | Run full 4-OS matrix; Win portable ZIP custom step; first tagged dry-run release; manual smoke per OS; verify auto-update happy path |

## Next Steps

- Approval: ✅ received 2026-05-31.
- Plan handoff: `/ck:plan --tdd` with this design as input → produces multi-phase TDD plan in `plans/260531-1457-cross-platform-release-pipeline/`.
- Post-plan gates (offered by `/ck:plan` itself): `/ck:plan validate`, `/ck:plan red-team`.
- Journal: `/ck:journal` after handoff.
