---
phase: 6
title: "Portable ZIP and dry-run release"
status: blocked
priority: P1
effort: "0.5d"
dependencies: [4, 5]
blockedBy: ["GH Secrets (signing key)", "repo pushed to origin", "tag push + CI runners"]
---

> **Note (2026-05-31):** The Windows portable-ZIP step is already implemented in
> `.github/workflows/release.yml` (it lives in that file, not a separate one) and
> is actionlint-clean. Phase 3 icons are generated and a real Linux `.deb` bundle
> was verified locally. What remains is the **tag dry-run** itself (`v0.1.0-rc.1`),
> which needs GH Secrets populated, the repo pushed to `origin`
> (`https://github.com/monet88/docflare.git`, public), and GitHub CI runners.
> These cannot be completed autonomously.

# Phase 6: Portable ZIP and dry-run release

## Overview

Add Windows-only post-bundle step that packages the NSIS-installed app + sidecar into `Docflare_v.X.Y.Z_x64_portable.zip` and uploads it to the same draft release. Then run a full dry-run: tag `v0.1.0-rc.1`, watch all 5 jobs (4 build + aggregate-updater), verify 14 release assets (incl. merged `latest.json`), and exercise the auto-updater happy path with a follow-up `v0.1.0-rc.2` tag.

## Requirements

- Functional:
  - On Windows job only, after `tauri-action` succeeds, a follow-up step builds the portable ZIP from the bundle output dir.
  - Portable ZIP contains: `Docflare.exe`, `cloudflared.exe`, `WebView2Loader.dll` (if Tauri emits it), and any required runtime DLLs.
  - ZIP filename: `Docflare_v.<version>_x64_portable.zip` (matches ProxyPal naming).
  - ZIP attached to the same draft release via `gh release upload` (uses `GITHUB_TOKEN`).
  - Tagged dry-run release `v0.1.0-rc.1` produces 14 release assets (incl. merged `latest.json`) in draft.
  - Auto-updater test: install `rc.1` locally, publish `rc.2`, confirm app prompts upgrade and restarts on the new version.
  - Manual smoke: install `.deb` on Ubuntu, `.dmg` on a Mac, `.exe` on Windows; onboarding screen renders; profile save succeeds (or fails with friendly Secret Service error on headless Linux).
- Non-functional:
  - Portable ZIP step must NOT require admin / signing / extra installer.
  - Step must fail-fast if expected files missing (no silent half-ZIP).

## Architecture

```text
windows-latest job
  |
  +-- tauri-action -> emits NSIS .exe + .sig under src-tauri/target/release/bundle/nsis/
  |                                       and Docflare.exe under src-tauri/target/release/
  |
  v
post-bundle PowerShell step:
  - read version from package.json
  - mkdir staging/Docflare-<version>
  - copy Docflare.exe + cloudflared.exe + any *.dll from target/release/
  - Compress-Archive staging/ -> Docflare_v.<version>_x64_portable.zip
  - gh release upload <tag> Docflare_v.<version>_x64_portable.zip --clobber
```

## Related Code Files

- Modify: `.github/workflows/release.yml` — add Windows-only post-bundle step block
- Reference: existing `tauri-action` output paths; `package.json` version field

## Implementation Steps (TDD)

### Red

1. Extend `scripts/test/workflow.test.mjs` with:
   - `release.yml` contains a step keyed by `if: matrix.os == 'windows-latest'` that runs `gh release upload` with a filename matching `Docflare_v\..+_x64_portable\.zip`.
   - The step uses `GITHUB_TOKEN` from secrets.
   - The step depends on tauri-action having run (i.e., listed AFTER `tauri-action` step in the steps array).
2. Add a release-artifact assertion script `scripts/test/release-assets.test.mjs` that, given a JSON list of release assets (output of `gh release view <tag> --json assets`), validates the 14 expected assets are present:
   ```
   Docflare_<v>_aarch64.dmg
   Docflare_aarch64.app.tar.gz
   Docflare_aarch64.app.tar.gz.sig
   Docflare_<v>_x64.dmg
   Docflare_x64.app.tar.gz
   Docflare_x64.app.tar.gz.sig
   Docflare_<v>_x64-setup.exe
   Docflare_<v>_x64-setup.exe.sig
   Docflare_v.<v>_x64_portable.zip
   Docflare_<v>_amd64.deb
   Docflare_<v>_amd64.deb.sig
   Docflare_<v>_amd64.AppImage
   Docflare_<v>_amd64.AppImage.sig
   latest.json
   ```
   **Asset count (canonical):** 8 installer/payload files (2 dmg + 2 app.tar.gz + 1 exe + 1 portable.zip + 1 deb + 1 AppImage) + 5 `.sig` files (the 2 app.tar.gz, exe, deb, AppImage) + 1 `latest.json` = **14 release assets total**. Note: portable.zip and the 2 dmg do not carry `.sig` files. The test asserts exactly these 14 names.
3. `npm run test:scripts` — must fail (workflow doesn't have the step yet).

### Green

4. Edit `.github/workflows/release.yml`, append after `tauri-action` step in the matrix-conditional Windows path:
   ```yaml
   - name: Build Windows portable ZIP
     if: matrix.os == 'windows-latest'
     shell: pwsh
     run: |
       $version = (Get-Content package.json | ConvertFrom-Json).version
       $stage = "staging/Docflare-$version"
       New-Item -ItemType Directory -Force -Path $stage | Out-Null
       Copy-Item src-tauri/target/${{ matrix.target }}/release/Docflare.exe $stage/
       Copy-Item src-tauri/binaries/cloudflared-x86_64-pc-windows-msvc.exe $stage/cloudflared.exe
       Get-ChildItem src-tauri/target/${{ matrix.target }}/release/*.dll -ErrorAction SilentlyContinue |
         Copy-Item -Destination $stage/
       $zip = "Docflare_v.${version}_x64_portable.zip"
       Compress-Archive -Path "$stage/*" -DestinationPath $zip -Force
       gh release upload "${{ github.ref_name }}" $zip --clobber
     env:
       GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```
5. `npm run test:scripts` — green on workflow.test.mjs.
6. Push tag `v0.1.0-rc.1` (after committing all phases).
7. Watch GH Actions: 4 jobs run.
8. After draft release exists, run locally:
   ```bash
   gh release view v0.1.0-rc.1 --json assets > /tmp/assets.json
   node scripts/test/release-assets.test.mjs /tmp/assets.json
   ```
   - Must pass.
9. **Auto-updater happy path:**
   - Publish the draft (move `v0.1.0-rc.1` to non-draft).
   - Install on local Linux (or any one OS).
   - Bump `package.json`, `Cargo.toml`, `tauri.conf.json` versions to `0.1.0-rc.2`.
   - Tag `v0.1.0-rc.2`, wait for build, publish.
   - Launch the previously-installed app: should prompt update within 1 launch; restart; confirm new version reported.
10. **Manual smoke matrix:** install one artifact per OS (3 testers if available, or 1 person 3 VMs):
    - Onboarding renders.
    - Save profile with valid Cloudflare creds → success.
    - Linux: confirm friendly error if `gnome-keyring` not running.

### Refactor

11. If portable ZIP step grows >15 lines, extract to `scripts/build-portable-zip.ps1` and call from workflow.
12. Add a brief `## Releases` section update in `README.md` with actual artifact filenames now known.

### Verify

13. `npm run test:scripts` — green.
14. `gh release view v0.1.0-rc.1 --json assets` shows 14 assets total (8 installer/payload + 5 sig + latest.json) and `latest.json` has all 4 platform keys.
15. Auto-updater happy path verified (rc.1 → rc.2).
16. Manual smoke per OS: pass.

## Success Criteria

- [ ] Windows portable ZIP step lives in `release.yml`, runs only on `windows-latest`
- [ ] Portable ZIP contains `Docflare.exe` + `cloudflared.exe` (+ any required DLLs)
- [ ] ZIP filename matches `Docflare_v.<version>_x64_portable.zip`
- [ ] Tag `v0.1.0-rc.1` produces 14 release assets (8 installer/payload + 5 `.sig` + `latest.json`)
- [ ] All 4 build jobs + `aggregate-updater` job green
- [ ] `latest.json` carries 4 platform entries with valid signatures (verified post-merge, not assumed)
- [ ] Auto-updater happy path: `rc.1` → `rc.2` upgrade prompted within 1 launch
- [ ] Manual smoke: install + onboarding + save profile passes on each OS (Linux Secret Service error is friendly, not a crash)
- [ ] `README.md` Releases section updated with actual filenames

## Risk Assessment

- **Risk:** `tauri-action` output path differs from assumed `src-tauri/target/<triple>/release/Docflare.exe`. **Mitigation:** Phase 4 dry-run dispatch confirmed actual path; adjust before tagging.
- **Risk:** Compress-Archive on Windows runners ships old PowerShell that can't compress >2 GB; bundle is < 30 MB so safe. **Mitigation:** none needed.
- **Risk:** Portable ZIP missing a required DLL → app fails on user machines. **Mitigation:** catch-all `*.dll` copy + manual smoke before publishing.
- **Risk:** Updater rc.1 → rc.2 fails because endpoint URL placeholder `<owner>` never replaced. **Mitigation:** Phase 3 leaves a TODO; Phase 6 explicitly checks endpoint resolves to a real URL before tagging.
- **Risk:** Updater pubkey mismatch between rc.1 install and rc.2 sign. **Mitigation:** keypair generated once in Phase 3; secrets stable; no rotation between rc cycles.
- **Risk:** GH `gh release upload` race when jobs upload concurrently. **Mitigation:** `tauri-action` handles its own assets sequentially per job; portable ZIP step runs only on Windows job AFTER tauri-action completes; the merged `latest.json` is uploaded by the single `aggregate-updater` job (runs after all builds) — single writer per asset.
- **Risk:** macOS user reports Gatekeeper rejection because README note ignored. **Mitigation:** README note is prominent + linked from release notes; internal team accepts.
