# Architecture

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 + TypeScript + Vite 7 | Vanilla CSS, no router library, tab-based navigation |
| Backend | Rust (Tauri v2) | Async commands, trait-based DI, global config mutex |
| Secret storage | OS keyring (`keyring` crate v3) | Windows Credential Manager / macOS Keychain / Linux Secret Service |
| HTTP client | `reqwest` 0.12 (rustls-tls) | Bounded timeouts (5s connect, 15s request) |
| Serialization | `serde` + `serde_json` | camelCase rename for frontend compatibility |
| IDs | `uuid` v4 | Profile IDs, route IDs, secret refs |
| Timestamps | `chrono` (RFC 3339) | `lastValidatedAt`, `createdAt` |
| Config persistence | JSON file (atomic write via tempfile + rename) | Retry on Windows lock contention |
| Distribution | GitHub Actions matrix (4 OS) | Tauri updater (minisign + GitHub Releases CDN) |
| Sidecar | Pinned `cloudflared` binary | SHA256-verified, per-target-triple naming |

## Source Hierarchy

```text
docflare/
├── src/                          # Frontend (React + TypeScript)
│   ├── features/
│   │   ├── onboarding/           # Profile CRUD UI (form, card list)
│   │   └── routes/               # Route management UI (table, form)
│   ├── lib/
│   │   └── tauri/                # Typed invoke wrappers (ProfileApi, RouteApi)
│   ├── app.tsx                   # Tab navigation shell
│   ├── main.tsx                  # React 18 entry
│   └── styles.css                # Global styles
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── cloudflare/           # Cloudflare API client + models
│   │   │   ├── client.rs         # CloudflarePreflight trait + CloudflareClient
│   │   │   └── models.rs         # API response types
│   │   ├── commands/             # Tauri command handlers (thin wiring)
│   │   │   ├── health.rs         # health_check
│   │   │   ├── profile.rs        # get_profile, get_profiles, validate_and_save_profile, set_active_profile, delete_profile
│   │   │   └── route.rs          # get_routes, add_route, update_route, delete_route
│   │   ├── domain/               # Models + validation logic
│   │   │   ├── profile.rs        # ValidateAndSaveProfileInput, CloudflareProfileMetadata, SavedProfile, masking
│   │   │   └── route.rs          # Route, CreateRouteInput, UpdateRouteInput, hostname/target validation
│   │   ├── services/             # Business logic orchestration
│   │   │   ├── validation_service.rs  # Profile lifecycle (validate, save, switch, delete)
│   │   │   └── route_service.rs       # Route CRUD with ownership + limit enforcement
│   │   ├── store/                # Persistence layer
│   │   │   ├── config_lock.rs         # Global CONFIG_MUTATION_LOCK (std::sync::Mutex)
│   │   │   ├── profile_config_store.rs # AppConfig JSON read/write (atomic, legacy migration)
│   │   │   ├── secret_store.rs        # SecretStore trait (put, delete)
│   │   │   ├── keyring_secret_store.rs # Production impl (OS keyring)
│   │   │   └── fake_secret_store.rs   # Test impl (in-memory)
│   │   ├── error.rs              # AppError enum + UiError serialization + user messages
│   │   └── lib.rs                # Tauri builder: plugins + invoke_handler registration
│   ├── tests/                    # Integration tests
│   │   ├── profile_validation_tests.rs
│   │   └── route_crud_tests.rs
│   └── Cargo.toml
├── scripts/                      # Build + CI tooling
│   ├── harness                   # Harness CLI entrypoint (bash)
│   ├── bin/harness-cli           # Prebuilt Rust binary
│   ├── download-sidecar.mjs      # Cross-platform cloudflared fetch
│   ├── verify-sidecar.mjs        # SHA256 verification
│   ├── sidecar-manifest.json     # Pinned version + per-target hashes
│   ├── build-updater-fragment.mjs
│   ├── merge-updater-manifest.mjs
│   └── test/                     # Script tests (Node test runner)
├── .github/workflows/
│   ├── ci.yml                    # PR + push: lint, test, clippy, compile (4 OS)
│   └── release.yml               # Tag push: build, bundle, sign, upload (14 assets)
├── docs/                         # Product + harness documentation
└── plans/                        # Implementation plans (phased)
```

## Layering

```text
domain (models, validation, value objects)
  <- services (business logic orchestration)
     <- store (config persistence, secret storage)
     <- cloudflare (HTTP API client)
        <- commands (Tauri invoke handlers — thin wiring)
           <- frontend (React components, typed API wrappers)
```

## Dependency Rule

| Layer | May depend on | Must not depend on |
|-------|---------------|-------------------|
| domain | nothing external except serde, chrono, uuid | services, store, cloudflare, commands, frontend |
| services | domain, store traits, cloudflare traits | commands, frontend, concrete store impls |
| store | domain (for types), error | services, cloudflare, commands |
| cloudflare | domain (for input types), error | services, store, commands |
| commands | all backend layers | frontend state, platform assumptions |
| frontend | Tauri invoke API contracts | Rust internals directly |

## Data Flow

### Profile Save (happy path)

```text
Frontend form submit
  → invoke("validate_and_save_profile", {input})
  → commands::profile::validate_and_save_profile
  → ValidationService::validate_and_save_profile
    → input.trimmed() + has_valid_resource_ids()
    → CloudflareClient::preflight (GET zone, DNS, tunnel)
    → config_mutation_guard() (acquire global lock)
    → SecretStore::put (candidate secret ref → keyring)
    → ProfileConfigStore::write (atomic JSON commit)
    → SecretStore::delete (old secret ref, if different)
  → SavedProfile::from_metadata (mask IDs)
  → UiError on failure (code + user message)
```

### Route Add (happy path)

```text
Frontend form submit
  → invoke("add_route", {input})
  → commands::route::add_route
  → RouteService::add_route
    → is_valid_hostname + is_valid_target
    → config_mutation_guard()
    → verify profile exists
    → check route count < 100
    → is_unique_hostname_in_profile
    → generate UUID, push to config.routes
    → ProfileConfigStore::write (atomic)
  → Route (full, unmasked — routes are not secrets)
```

## Parse-First Boundary Rule

All external data is parsed at boundaries before entering inner code:

- **Frontend → Backend:** `ValidateAndSaveProfileInput`, `CreateRouteInput`, `UpdateRouteInput` (serde deserialization + explicit validation)
- **Cloudflare API → Backend:** `CloudflareResponse<T>`, `ListResult<T>` (typed JSON parsing)
- **Config file → Backend:** `RawAppConfig` → `AppConfig` (legacy migration in `From` impl)
- **OS keyring → Backend:** String values only (no parsing needed)

## Concurrency Model

- **Single global mutex** (`CONFIG_MUTATION_LOCK`) guards all config file mutations
- Desktop app — no throughput concern; prevents race conditions on the same JSON file
- Cloudflare preflight runs outside the lock (network I/O); lock acquired only for local state changes
- Future: if reconciliation phase needs async mutations, evaluate `tokio::Mutex` (documented as tech debt)

## Security Boundaries

- API tokens never cross backend→frontend boundary after initial submit
- Frontend receives only masked identifiers (prefix…suffix format)
- Config JSON stores `tokenSecretRef` (keyring lookup key), never raw tokens
- Candidate secret pattern: new secret stored first, old deleted only after successful config commit
- Failed config write → candidate secret cleaned up, old profile preserved
- `cloudflared` spawned from Rust only (never via user-visible shell)
- All secrets redacted from logs

## Observability (planned)

No structured logging exists yet. When tunnel lifecycle (E04) is implemented:

- One canonical JSON log line per tunnel event
- Fields: timestamp, level, tunnel_id, action, duration_ms, status, message
- Redacted log console (E08) will display max 1000 lines with secrets stripped

## Key Decisions

| ADR | Decision | Impact |
|-----|----------|--------|
| 0001 | Harness-first development | Docs/process before code |
| 0004 | SQLite durable layer | Operational records in harness.db |
| 0005 | Prebuilt Rust harness CLI | No Rust toolchain needed for harness ops |
| 0006 | CF Tunnel seed spec intake | API-Token model chosen over Tunnel-Token |
| 0007 | Cross-platform release pipeline | Public repo, no code-signing, 4 targets, minisign updater |
