# Non-Functional Requirements & Pinned Sidecar (CF Tunnel Desktop)

## Pinned Sidecar Policy (Supply-Chain Safety)
- `cloudflared` version is **strictly pinned** for reproducible builds and to prevent supply-chain attacks.
- Version configuration (example):

```json
{
  "cloudflaredVersion": "2026.5.1",
  "windowsX64Sha256": "<TODO: Obtain real checksum — run `Get-FileHash -Algorithm SHA256 cloudflared-x86_64-pc-windows-msvc.exe` on the official 2026.5.1 windows build downloaded from Cloudflare releases, then update both this file and the build hook script>"
}
```

## Build Hook Requirement
A PowerShell script (`download-sidecar.ps1`) must:
- Download the exact pinned version
- Verify the SHA256 checksum
- Rename to `cloudflared-x86_64-pc-windows-msvc.exe`
- Place in `src-tauri/binaries/`

Build fails if the binary or checksum verification is missing.

## Performance & Footprint Targets
- App starts (hidden or visible) in < 2.0 s
- Tauri host RSS < 30 MB while minimized
- `cloudflared` process RSS < 30 MB
- Total bundle footprint aim < 150 MB (WebView2 excluded from the 60 MB ceiling)
- In-memory logs capped at 1000 lines
- Target OS: Windows 10/11 x64

> Derived from historical seed `seed/2026-05-23-cf-tunnel-project-overview-pdr.md`.  
> Last updated during 2026-05-23 seed intake. Future changes via normal story + decision process.