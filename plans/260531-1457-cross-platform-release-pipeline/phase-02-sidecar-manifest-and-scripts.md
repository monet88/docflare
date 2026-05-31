---
phase: 2
title: "Sidecar manifest and scripts"
status: complete
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Sidecar manifest and scripts

## Overview

Build cross-platform Node-only sidecar download + verify pipeline replacing the current Windows-only PowerShell script. Manifest is the single source of truth for `cloudflared` version + per-target SHA256.

## Requirements

- Functional:
  - `scripts/sidecar-manifest.json` carries: pinned `cloudflaredVersion`, 4 SHA256 checksums, asset filename map per Tauri target triple, download URL template.
  - **Hash semantics (CRITICAL — verified against live cloudflared release `2026.5.2`):** cloudflared's published SHA256 differs by asset type. For raw-binary assets (`cloudflared-linux-amd64`, `cloudflared-windows-amd64.exe`) the published checksum is the **downloaded file** hash (verified: `cloudflared-linux-amd64` digest `5286698547…` == release-body value). For macOS `.tgz` assets the published checksum is the hash of the **extracted binary inside the archive**, NOT the `.tgz` (verified: `cloudflared-darwin-arm64.tgz` GitHub archive digest `ba94054c…` ≠ release-body value `cd9f764a…`). Verify each target against the correct artifact: extract-then-hash for `tgz:*` targets, download-then-hash for raw binaries.
  - `scripts/download-sidecar.mjs` downloads the asset for one or all targets, then for `tgz:*` targets **extracts first and verifies the SHA256 of the extracted binary**, for raw-binary targets verifies the SHA256 of the downloaded file, and writes binary into `src-tauri/binaries/cloudflared-<triple>(.exe)`.
  - `scripts/verify-sidecar.mjs` validates existing binaries against manifest without network.
  - `package.json` exposes `download-sidecar`, `verify-sidecar`, `test:scripts` npm scripts.
  - Script tests cover: hash mismatch rejection, missing manifest entry rejection, target validation, dry-run mode.
- Non-functional:
  - Pure Node 20 stdlib (no extra npm deps); `fetch`, `crypto.createHash`, `node:zlib`, `node:tar` not available so use `child_process.execFileSync('tar', ...)` for macOS tarballs.
  - Script must run on Windows, macOS, Linux without modification (no shell out except `tar`).
  - SHA256 mismatch must exit non-zero with clear message; never write a bad binary.

## Architecture

```text
scripts/sidecar-manifest.json   <-- single source of truth (committed)
        |
        v
download-sidecar.mjs --target <triple>
        |
        v
fetch URL -> (tgz target?) extract -> hash EXTRACTED binary -> compare manifest -> place
          -> (raw binary?)         hash DOWNLOADED file    -> compare manifest -> place
        |
        v
verify-sidecar.mjs <-- read-only re-check, callable in CI post-download
```

Hash-source rule (see Requirements): `tgz:*` targets verify the extracted binary; raw-binary targets verify the downloaded file. This matches cloudflared's published checksum semantics verified against release `2026.5.2`.

Tauri auto-resolves binary by `--target` flag at build time using the `cloudflared-<triple>` naming convention.

## Related Code Files

- Create: `scripts/sidecar-manifest.json`
- Create: `scripts/download-sidecar.mjs`
- Create: `scripts/verify-sidecar.mjs`
- Create: `scripts/lib/manifest.mjs` — shared parser + target validator (DRY)
- Create: `scripts/test/sidecar.test.mjs` — Node test runner cases
- Create: `scripts/test/fixtures/manifest-valid.json`
- Create: `scripts/test/fixtures/manifest-bad-hash.json`
- Modify: `package.json` — add npm scripts + ensure `"type": "module"` (already set).
- Modify: `.gitignore` — ensure `src-tauri/binaries/cloudflared*` ignored locally (CI re-downloads).

## Implementation Steps (TDD)

### Red

1. Write `scripts/test/sidecar.test.mjs` covering:
   - `loadManifest()` rejects manifest missing `cloudflaredVersion`.
   - `loadManifest()` rejects manifest missing target entry.
   - `resolveAsset(manifest, target)` returns correct URL for each of the 4 targets.
   - `hashTarget()` hashes the extracted binary for `tgz:*` targets and the downloaded file for raw-binary targets (use a small fixture `.tgz` with a known inner-file hash to prove extract-then-hash, and a raw fixture file for download-then-hash).
   - `verifyHash(filePath, expected)` returns false on mismatch, true on match (use small fixture file with known hash).
   - `download-sidecar.mjs --target <bogus>` exits non-zero.
   - `verify-sidecar.mjs --all` against fixture `binaries/` produces correct pass/fail per target.
2. `node --test scripts/test/sidecar.test.mjs` — must fail.

### Green

3. Write `scripts/sidecar-manifest.json` skeleton with placeholder hashes (`<TODO>` strings) and real cloudflared release URLs. Pin to the latest verified version `2026.5.2`. Note `hashOf` per target: `extracted` for `tgz:*`, `download` for raw binaries:
   ```json
   {
     "cloudflaredVersion": "2026.5.2",
     "downloadUrlTemplate": "https://github.com/cloudflare/cloudflared/releases/download/{version}/{asset}",
     "targets": {
       "x86_64-pc-windows-msvc":   { "asset": "cloudflared-windows-amd64.exe", "sha256": "20b9638f685333d623798e733effbad2487093f15ba592f6c7752360ff3b7ab7", "outName": "cloudflared-x86_64-pc-windows-msvc.exe", "extract": null, "hashOf": "download" },
       "x86_64-unknown-linux-gnu": { "asset": "cloudflared-linux-amd64",       "sha256": "5286698547f03df745adb2355f04c12dde52ef425491e81f433642d695521886", "outName": "cloudflared-x86_64-unknown-linux-gnu",     "extract": null, "hashOf": "download" },
       "aarch64-apple-darwin":     { "asset": "cloudflared-darwin-arm64.tgz",  "sha256": "cd9f764abfd06757b4def10ee5ba3d862381ed9fc02d6c1f06086c23d88695c6", "outName": "cloudflared-aarch64-apple-darwin",         "extract": "tgz:cloudflared", "hashOf": "extracted" },
       "x86_64-apple-darwin":      { "asset": "cloudflared-darwin-amd64.tgz",  "sha256": "c4fdc6021cd63003e32e70b577e17d47d493c6df4e24c7c97169ed74b67a715d", "outName": "cloudflared-x86_64-apple-darwin",          "extract": "tgz:cloudflared", "hashOf": "extracted" }
     }
   }
   ```
   > Hashes above are from cloudflared release `2026.5.2` body (verified 2026-05-31). Linux/Windows = downloaded-file hash; macOS `.tgz` = extracted-binary hash (the `.tgz` archive digest differs and must NOT be used).
4. Implement `scripts/lib/manifest.mjs`: `loadManifest(path)`, `resolveAsset(manifest, target)`, `verifyHash(file, expected)`, `hashTarget(downloadedPath, targetEntry)` (returns the hash of the downloaded file OR the extracted binary per `hashOf`), schema validation.
5. Implement `scripts/download-sidecar.mjs`:
   - args: `--target <triple>` or `--all`; `--manifest <path>` (default `scripts/sidecar-manifest.json`); `--out <dir>` (default `src-tauri/binaries`).
   - Flow: fetch → stream to temp → IF `extract: tgz:<entry>` extract the named entry, hash the **extracted binary**; ELSE hash the **downloaded file** → compare to `sha256` → on match rename to `outName` → atomic move into `--out`. Never hash a `.tgz` archive directly.
   - Hard-fail: skip TODO hash entries with explicit error "manifest hash for <target> is TODO; populate before CI".
6. Implement `scripts/verify-sidecar.mjs`:
   - args: `--all` or `--target <triple>`; reads `--out` dir, hashes each **already-extracted** binary (binaries land extracted in `--out`, so verify-sidecar always hashes the file as-is), compares to manifest `sha256`. Exit 0 on all pass, 1 on any mismatch.
7. Add fixtures + run tests until green.
8. Verify the pre-populated SHA256 values against a fresh download (hashes are already filled from release `2026.5.2`):
   - Local: `node scripts/download-sidecar.mjs --all` → for `tgz` targets confirm extracted-binary hash matches; for raw targets confirm downloaded-file hash matches. If any mismatch, the manifest value or `hashOf` is wrong — fix before CI.
   - Document hash source version + date in ADR `0007` (already drafted Phase 1).
9. Add `package.json` scripts:
   ```json
   {
     "scripts": {
       "download-sidecar": "node scripts/download-sidecar.mjs",
       "verify-sidecar":   "node scripts/verify-sidecar.mjs --all",
       "test:scripts":     "node --test scripts/test/"
     }
   }
   ```

### Refactor

10. Extract URL templating + extract-tarball helpers to `scripts/lib/` for reuse.
11. Add concise JSDoc on exported functions.

### Verify

12. `npm run test:scripts` — green.
13. `npm run download-sidecar -- --all` (local) — produces 4 binaries in `src-tauri/binaries/`.
14. `npm run verify-sidecar` — green.
15. Manual: try corrupt one byte of one binary → `npm run verify-sidecar` exits non-zero with target name.

## Success Criteria

- [ ] `scripts/sidecar-manifest.json` carries 4 real SHA256 checksums (no `<TODO>` left), pinned to `2026.5.2`, each with correct `hashOf`
- [ ] macOS `tgz` targets verify the **extracted binary** hash (not the archive); Linux/Windows verify the **downloaded file** hash
- [ ] `npm run test:scripts` passes (covers hash-source rule, target validation, mismatch reject)
- [ ] `npm run download-sidecar -- --all` succeeds on Linux runner without modification
- [ ] `npm run verify-sidecar` exits non-zero on tampered binary
- [ ] No new npm dependencies added (stdlib only + system `tar`)
- [ ] `src-tauri/binaries/cloudflared*` is gitignored (binaries fetched at build time)

## Risk Assessment

- **Risk:** Cloudflare changes asset filename convention. **Mitigation:** manifest is the only place naming lives; PR-only update.
- **Risk:** macOS tarball entry path differs (`.tgz` may have nested dir). **Mitigation:** test against actual `cloudflared-darwin-arm64.tgz`; `extract: "tgz:cloudflared"` directive specifies entry name explicitly.
- **Risk (verified):** cloudflared publishes the extracted-binary SHA256 for `.tgz` macOS assets, but the downloaded-file SHA256 for raw Linux/Windows binaries. Hashing the wrong artifact fails verification on mac every run. **Mitigation:** `hashOf` field per target drives extract-then-hash vs download-then-hash; dedicated test fixture proves both paths.
- **Risk:** Hash drift on minor version bump. **Mitigation:** version bump = manifest PR with all 4 hashes refreshed atomically; CI fails if any one mismatches.
- **Risk:** Node `fetch` redirect handling on GH release URLs. **Mitigation:** `redirect: 'follow'` (default) + assert final URL hostname is `github.com` or `objects.githubusercontent.com`.
