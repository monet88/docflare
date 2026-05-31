---
phase: 3
title: "Tauri config and updater key"
status: complete
priority: P1
effort: "0.5d"
dependencies: [2]
note: "Icons generated from placeholder logo (user to swap later). Real Linux .deb bundle verified. GH Secrets still pending for signed CI builds."
---

# Phase 3: Tauri config and updater key

## Prerequisites (from Validation Session 1)

- **Public GitHub repo created + pushed** before this phase. Repo is public by decision (holds no secrets — only exposes Cloudflare tunnel URLs); the Tauri updater requires publicly downloadable release assets, so a private repo would 401/404 the updater. Resolve the real `owner/name` here — `<owner>` is NOT a deferred TODO.
- **1024×1024 logo PNG supplied** by the user for icon generation (step 8). Phase blocks until provided.

## Overview

Activate Tauri bundler, register external sidecar, register the 5 bundle targets, and wire the updater plugin with a freshly generated minisign keypair. This phase produces a buildable + updater-aware Tauri config without yet running CI.

## Requirements

- Functional:
  - `src-tauri/tauri.conf.json` `bundle.active = true` with targets `["app", "dmg", "nsis", "deb", "appimage"]`.
  - `bundle.externalBin = ["binaries/cloudflared"]` resolves to per-target binaries from Phase 2.
  - `bundle.linux.deb.depends` lists required system packages (`libwebkit2gtk-4.1-0`, `libgtk-3-0`, `libayatana-appindicator3-1`).
  - `bundle.macOS.minimumSystemVersion = "10.15"`.
  - `plugins.updater.active = true` with `endpoints` pointing at the **public** repo `https://github.com/<owner>/docflare/releases/latest/download/latest.json` (real `owner` filled from the pushed repo) and `pubkey` populated.
  - Cargo dependency `tauri-plugin-updater` added to `src-tauri/Cargo.toml` and registered in `src-tauri/src/lib.rs` (only the plugin init line; no business logic).
  - **Updater capability granted:** `src-tauri/capabilities/default.json` permissions include `updater:default` (Tauri v2 denies plugin IPC by default — without this the updater is blocked at runtime even when registered).
  - **Full icon set generated:** `src-tauri/icons/` currently holds only a 70-byte `icon.png` placeholder. Generate the real set (`icon.icns`, `icon.ico`, sized PNGs) via `npm run tauri icon` and commit — `dmg`/`nsis` bundling hard-fails without valid platform icons.
  - Local key files generated; private key + password stored in GH Secrets; public key checked into config.
- Non-functional:
  - Private key MUST NOT be committed. Add `*.key`, `*.key.pwd` to `.gitignore` if not already.
  - `cargo check` and `npm run build` still pass after config edits.
  - `tauri build --no-bundle` still succeeds (builds binary without bundling, smoke-tests config parsing).

## Architecture

```text
tauri.conf.json
  bundle.targets        -> tauri-action picks per --bundles flag
  bundle.externalBin    -> resolves binaries/cloudflared-<triple>(.exe) at bundle time
  plugins.updater       -> client-side check + download + verify against pubkey

src-tauri/capabilities/default.json
  permissions += updater:default   (else updater IPC denied at runtime)

src-tauri/icons/
  icon.icns + icon.ico + sized PNGs  (real set; placeholder icon.png is 70 bytes -> bundle fails)

src-tauri/Cargo.toml
  tauri-plugin-updater

src-tauri/src/lib.rs
  Builder::default().plugin(tauri_plugin_updater::Builder::new().build()).invoke_handler(...)  (no .setup() exists)

GH Secrets (no repo file)
  TAURI_SIGNING_PRIVATE_KEY
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

## Related Code Files

- Modify: `src-tauri/tauri.conf.json` — bundle, externalBin, plugins.updater
- Modify: `src-tauri/Cargo.toml` — add `tauri-plugin-updater`
- Modify: `src-tauri/src/lib.rs` — register plugin
- Modify: `src-tauri/capabilities/default.json` — add `updater:default` permission
- Create: `src-tauri/icons/icon.icns`, `src-tauri/icons/icon.ico`, sized PNGs — via `npm run tauri icon` (replaces 70-byte placeholder)
- Modify: `.gitignore` — `*.key`, `*.key.pwd`, `~/.tauri/` ignore patterns documented

## Implementation Steps (TDD)

### Red

1. Add `scripts/test/tauri-config.test.mjs` covering:
   - `tauri.conf.json` has `bundle.active === true`.
   - `bundle.targets` is exactly `["app", "dmg", "nsis", "deb", "appimage"]` (sorted).
   - `bundle.externalBin` includes `"binaries/cloudflared"`.
   - `bundle.linux.deb.depends` includes the 3 required packages.
   - `plugins.updater.active === true`.
   - `plugins.updater.endpoints[0]` ends with `/releases/latest/download/latest.json`.
   - `plugins.updater.pubkey` is non-empty and not literally `"<TODO>"`.
   - `capabilities/default.json` `permissions` includes `updater:default`.
2. `npm run test:scripts` — must fail.

### Green

3. Generate keypair locally:
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/docflare.key
   ```
   - Set a strong password; record both privately.
   - Save private key + password to GH Secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Add to `src-tauri/Cargo.toml`:
   ```toml
   tauri-plugin-updater = "2"
   ```
5. Edit `src-tauri/src/lib.rs` to register the plugin. The actual chain (`src-tauri/src/lib.rs:9-23`) is `tauri::Builder::default().invoke_handler(tauri::generate_handler![...]).run(tauri::generate_context!())` — there is **no `.setup()`**. Insert `.plugin(tauri_plugin_updater::Builder::new().build())` immediately after `tauri::Builder::default()` and before `.invoke_handler(...)`:
   ```rust
   tauri::Builder::default()
       .plugin(tauri_plugin_updater::Builder::new().build())
       .invoke_handler(tauri::generate_handler![
           // ...existing handlers unchanged...
       ])
       .run(tauri::generate_context!())
   ```
   No new commands, no UI changes this phase.
6. Edit `src-tauri/tauri.conf.json`:
   ```jsonc
   {
     "bundle": {
       "active": true,
       "targets": ["app", "dmg", "nsis", "deb", "appimage"],
       "externalBin": ["binaries/cloudflared"],
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
         "pubkey": "<paste minisign public key from step 3>"
       }
     }
   }
   ```
7. Grant the updater capability in `src-tauri/capabilities/default.json` (currently only `["core:default"]`):
   ```json
   {
     "$schema": "../gen/schemas/desktop-schema.json",
     "identifier": "default",
     "description": "Default desktop capability",
     "windows": ["main"],
     "permissions": ["core:default", "updater:default"]
   }
   ```
8. Generate the real icon set (replaces the 70-byte `icon.png` placeholder) from the user-supplied 1024×1024 logo PNG (see Prerequisites) and commit the outputs:
   ```bash
   npm run tauri icon path/to/source-1024.png
   # emits src-tauri/icons/{32x32.png,128x128.png,128x128@2x.png,icon.icns,icon.ico,...}
   ```
9. Update `.gitignore` (add if missing):
   ```
   *.key
   *.key.pwd
   ```
10. Run validation locally:
   - `cd src-tauri && cargo check` — green.
   - `npm run build` — green (frontend only).
   - `npm run tauri build -- --no-bundle` — green (skip bundle, just compile pipeline).
11. Run `npm run test:scripts` — green.

### Refactor

12. Set the updater endpoint `<owner>` to the real public repo owner/name (resolved per Prerequisites; not deferred). <!-- Updated: Validation Session 1 - public repo pushed before Phase 3, owner resolved here -->
13. Confirm the generated icon set is present and valid (`file src-tauri/icons/icon.icns` reports a real icon, not the old 70-byte placeholder).

### Verify

14. `cargo check` + `cargo clippy --all-targets -- -D warnings` from `src-tauri/`.
15. `npm run test:scripts` green.
16. Manual: open `tauri.conf.json` and confirm pubkey is base64, no quotes/whitespace artifacts.
17. Smoke: `npm run tauri dev` still launches the app on local Linux.

## Success Criteria

- [ ] `bundle.active === true` and 5 targets registered
- [ ] `externalBin` references `binaries/cloudflared`
- [ ] `linux.deb.depends` lists 3 required packages
- [ ] `plugins.updater` configured with real public key
- [ ] `tauri-plugin-updater` registered in `src-tauri/src/lib.rs` after `Builder::default()`, before `.invoke_handler()`
- [ ] `capabilities/default.json` permissions include `updater:default`
- [ ] Real icon set generated (`icon.icns` + `icon.ico` valid, not 70-byte placeholder)
- [ ] `cargo check` + `cargo clippy -D warnings` green
- [ ] `npm run tauri build -- --no-bundle` green
- [ ] `npm run tauri dev` still launches app (no behaviour regression)
- [ ] GH Secrets populated; private key NOT in repo
- [ ] `npm run test:scripts` green

## Risk Assessment

- **Risk:** Updater plugin init throws if pubkey malformed. **Mitigation:** test asserts non-empty + non-TODO; manual eyeball of base64 in step 16.
- **Risk:** `<owner>` placeholder shipping unresolved. **Mitigation:** resolved in this phase (Prerequisites require the public repo pushed first); `tauri-config.test.mjs` can additionally assert the endpoint host contains no literal `<owner>`.
- **Risk:** `bundle.linux.deb.depends` mismatch with actual webkit2gtk version on user distros. **Mitigation:** library names match Tauri v2 official docs; add to README troubleshooting if reports surface.
- **Risk (verified):** `lib.rs` has no `.setup()` — earlier plan text assumed one. **Mitigation:** insert `.plugin()` between `Builder::default()` and `.invoke_handler()`; `cargo check` catches misorder.
- **Risk (verified):** missing `updater:default` capability silently denies updater IPC at runtime even with the plugin registered. **Mitigation:** capability edit + config test assertion are part of this phase.
- **Risk (verified):** `src-tauri/icons/` ships only a 70-byte `icon.png`; `dmg`/`nsis` bundling hard-fails on missing/invalid platform icons. **Mitigation:** generate full icon set via `npm run tauri icon` and commit before any bundle run.
