# Non-Functional Requirements & Pinned Sidecar (CF Tunnel Desktop)

## Pinned Sidecar Policy (Supply-Chain Safety)
- `cloudflared` version is **strictly pinned** for reproducible builds and to prevent supply-chain attacks.
- The committed `scripts/sidecar-manifest.json` is the single source of truth for the pinned version and per-target SHA256. Full manifest shape:

```json
{
  "cloudflaredVersion": "2026.5.2",
  "downloadUrlTemplate": "https://github.com/cloudflare/cloudflared/releases/download/{version}/{asset}",
  "targets": {
    "x86_64-pc-windows-msvc":   { "asset": "cloudflared-windows-amd64.exe", "sha256": "<win-amd64>",     "outName": "cloudflared-x86_64-pc-windows-msvc.exe", "extract": null,              "hashOf": "download" },
    "x86_64-unknown-linux-gnu": { "asset": "cloudflared-linux-amd64",       "sha256": "<linux-amd64>",   "outName": "cloudflared-x86_64-unknown-linux-gnu",     "extract": null,              "hashOf": "download" },
    "aarch64-apple-darwin":     { "asset": "cloudflared-darwin-arm64.tgz",  "sha256": "<darwin-arm64>",  "outName": "cloudflared-aarch64-apple-darwin",         "extract": "tgz:cloudflared", "hashOf": "extracted" },
    "x86_64-apple-darwin":      { "asset": "cloudflared-darwin-amd64.tgz",  "sha256": "<darwin-amd64>",  "outName": "cloudflared-x86_64-apple-darwin",          "extract": "tgz:cloudflared", "hashOf": "extracted" }
  }
}
```

- **Hash semantics:** cloudflared publishes the **downloaded-file** SHA256 for raw binaries (Linux, Windows) but the **extracted-binary** SHA256 for macOS `.tgz` assets. The `hashOf` field per target drives the verification path: `download` hashes the fetched file, `extracted` extracts the named entry from the tarball and hashes that. Hashing a `.tgz` archive directly will always fail macOS verification.

## Build Hook Requirement
The cross-platform Node script `scripts/download-sidecar.mjs` must:
- Download the exact pinned version for a given Tauri target triple (`--target`) or all targets (`--all`)
- For `tgz:*` targets, extract the inner binary and verify its SHA256; for raw-binary targets, verify the downloaded file's SHA256
- Rename to `cloudflared-<triple>(.exe)`
- Place in `src-tauri/binaries/`

`scripts/verify-sidecar.mjs` re-checks already-placed binaries against the manifest without network access. Build fails if the binary or checksum verification is missing or mismatched.

## Per-OS Performance & Footprint Targets
- App starts (hidden or visible) in < 2.0 s
- Tauri host RSS < 30 MB while minimized
- `cloudflared` process RSS < 30 MB
- Total bundle footprint aim < 150 MB (WebView2 excluded from the 60 MB ceiling)
- In-memory logs capped at 1000 lines
- Target OS: Windows 10/11 x64, macOS 10.15+ (Intel + Apple Silicon), Linux x64

> Derived from historical seed `seed/2026-05-23-cf-tunnel-project-overview-pdr.md`.  
> Last updated during 2026-05-23 seed intake. Future changes via normal story + decision process.
>
> See: ADR [0007 Cross-platform release pipeline](../decisions/0007-cross-platform-release-pipeline.md).