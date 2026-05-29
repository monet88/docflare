# Data Models & Route Reconciliation (CF Tunnel Desktop)

## Core Entities

### CloudflareProfile
```typescript
interface CloudflareProfile {
  accountId: string;
  zoneId: string;
  domain: string;
  apiTokenRef: string;   // keyring reference only
  email?: string;
}
```

### TunnelConfig
```typescript
interface TunnelConfig {
  tunnelId: string;
  tunnelName: string;
  tunnelTokenRef: string; // keyring reference only
}
```

### Route
```typescript
interface Route {
  id: string;
  hostname: string;       // e.g. "api.mycustomdomain.com"
  targetUrl: string;      // e.g. "http://localhost:8080"
  enabled: boolean;
  dnsRecordId?: string;   // only app-owned records
}
```

## Reconciliation & Drift Policy
- Local JSON is the single source of truth (Desired State).
- Cloudflare is the remote actual state.
- On detected drift (manual or periodic): show warning + require explicit user consent before reconciliation. Never auto-overwrite destructively.

## Target URL Validation Rules
- Allowed: `http://` and `https://` to `localhost`, `127.0.0.1`, `[::1]`, or loopback ports.
- Warning on private LAN IPs (`192.168.x.x`, `10.x.x.x`).
- Blocked: `file://`, `ftp://`, etc.

> Derived from historical seed `seed/2026-05-23-cf-tunnel-project-overview-pdr.md`.  
> Last updated during 2026-05-23 seed intake. Future changes via normal story + decision process.