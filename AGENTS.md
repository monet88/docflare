# Agent Instructions

## Project Context

**Docflare** — Cloudflare Tunnel desktop manager (Tauri v2 + React 18 + TypeScript + Rust).
Exposes `localhost` services to the internet via custom domains. Tokens stored in OS keyring only.

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript, Vite 7, vanilla CSS (dark/glassmorphism) |
| Backend | Rust (Tauri v2), reqwest, keyring crate, serde, chrono, uuid |
| Distribution | GitHub Actions matrix (4 OS), Tauri updater (minisign), GitHub Releases CDN |
| Testing | Vitest + React Testing Library (frontend), cargo test (backend), Node test runner (scripts) |

### Current Phase

- **Implemented:** Profile onboarding (E01), Route CRUD (E02), Sidecar build hook (E07), Cross-platform release pipeline (RELEASE-01)
- **Next:** Cloudflare reconciliation (E03), Tunnel lifecycle (E04), System tray (E05), Autostart (E06), Log console (E08)
- **Version:** 0.1.0 (v0.1.0-rc.1 dry-run verified)

### Quick Commands

```bash
npm run dev              # Frontend dev server (http://127.0.0.1:5173)
npm run build            # TypeScript check + Vite production build
npm run test             # Frontend tests (Vitest)
npm run lint             # ESLint
npm run test:scripts     # Script tests (Node test runner)

cargo test --manifest-path src-tauri/Cargo.toml    # Rust tests
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

npm run tauri dev        # Full desktop app (frontend + Rust backend)
npm run tauri build -- --no-bundle   # Compile check without bundling
```

### Architecture (abbreviated)

```
Frontend invoke() → Tauri Command → Service Layer → Store / CloudflareClient
                                                     ↓
                                      ProfileConfigStore (JSON, atomic writes)
                                      KeyringSecretStore (OS credential manager)
                                      CloudflareClient (HTTP preflight only)
```

- **10 Tauri commands:** health_check, get_profile, get_profiles, validate_and_save_profile, set_active_profile, delete_profile, get_routes, add_route, update_route, delete_route
- **Trait-based DI:** `CloudflarePreflight`, `SecretStore` — enables testing with fakes
- **Global mutex:** `CONFIG_MUTATION_LOCK` prevents concurrent config file mutations
- **Masking:** All IDs masked (prefix…suffix) before crossing backend→frontend boundary

### Key Files

| Purpose | Path |
|---------|------|
| App entry (Rust) | `src-tauri/src/lib.rs` |
| Cloudflare API client | `src-tauri/src/cloudflare/client.rs` |
| Profile service | `src-tauri/src/services/validation_service.rs` |
| Route service | `src-tauri/src/services/route_service.rs` |
| Config store | `src-tauri/src/store/profile_config_store.rs` |
| Error types | `src-tauri/src/error.rs` |
| Frontend app | `src/app.tsx` |
| Profile API contract | `src/lib/tauri/profile.ts` |
| Route API contract | `src/lib/tauri/route.ts` |
| CI workflow | `.github/workflows/ci.yml` |
| Release workflow | `.github/workflows/release.yml` |

### Locked Design Decisions

1. One tunnel, many ingress rules per profile
2. Tokens stay in OS keyring — JSON stores only secret refs
3. Drift requires explicit user consent before reconciliation
4. Pinned bundled sidecar only — no system PATH lookup
5. Local JSON = desired state; Cloudflare = remote actual state
6. Linux: hard-require Secret Service (no file fallback)

<!-- HARNESS:BEGIN -->
## Harness

This repo uses Harness. Before work, read:

- `README.md`
- `docs/HARNESS.md`
- `docs/FEATURE_INTAKE.md`
- `docs/ARCHITECTURE.md`
- `scripts/harness query matrix`

Use the Rust Harness CLI as the main operational tool. Run it through the
stable repo-local entrypoint `scripts/harness`, which uses the prebuilt Rust
binary at `scripts/bin/harness-cli` in installed projects.

Initialize the database if it does not exist:

```bash
scripts/harness init
```
<!-- HARNESS:END -->
