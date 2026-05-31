# Red Team Review — Cross-platform Release Pipeline

Date: 2026-05-31
Plan: `plans/260531-1457-cross-platform-release-pipeline/`
Reviewers: 4 lenses (6 phases) — Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic
Verification tier: Full (5+ phases) — Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier
Evidence: codebase grep/read + live cloudflared release API (`api.github.com/repos/cloudflare/cloudflared/releases/latest` → `2026.5.2`)

## Findings (adjudicated)

### Finding 1: `latest.json` overwritten across matrix jobs — updater breaks for 3/4 platforms — CRITICAL
- **Reviewer:** Failure Mode Analyst / Flow Tracer
- **Location:** Phase 4, Requirements + Risk (`phase-04-release-workflow.md:24`, `:166`)
- **Flaw:** Plan claims "`latest.json` uploaded once (tauri-action handles aggregation)" and risk note says full tag push spawns all 4 jobs so aggregation is fine. `tauri-action` generates `latest.json` **per job** containing only that job's built target(s). With 4 parallel matrix jobs each uploading to the same release, the last job to finish **overwrites** `latest.json` — the final manifest contains only 1–2 platforms, not all 4. tauri-action does NOT merge updater manifests across separate runner jobs.
- **Failure scenario:** Tag `v0.1.0` → 4 jobs run → final `latest.json` has only e.g. Windows. macOS + Linux users get "no update available" forever, or the updater 404s on missing platform keys. Silent until a user on the missing platform tries to update.
- **Evidence:** `phase-04-release-workflow.md:24` ("tauri-action handles aggregation"), `:166` (risk dismisses it). External: tauri-action per-job manifest behavior.
- **Disposition:** ACCEPT
- **Rationale:** Verified false assumption with real failure mode. Fix: add a dedicated post-matrix job that downloads all 4 per-target `latest.json` fragments (or per-target signatures) and merges into a single `latest.json` with all 4 platform keys, then uploads once. Alternatively use `tauri-action`'s documented `updaterJsonPreferNsis`/merge pattern with a separate aggregation step. This is the single biggest correctness bug in the plan.

### Finding 2: macOS sidecar SHA256 verification fails — hashing `.tgz` vs binary checksum — CRITICAL
- **Reviewer:** Failure Mode Analyst / Fact Checker
- **Location:** Phase 2, Architecture + Implementation flow (`phase-02-sidecar-manifest-and-scripts.md` — manifest `extract: "tgz:cloudflared"`, flow "download → hash → compare → extract")
- **Flaw:** cloudflared's release-body SHA256 for the macOS `.tgz` assets is the checksum of the **extracted binary**, NOT the `.tgz` archive. Verified against live API: asset `cloudflared-darwin-arm64.tgz` GitHub `digest` = `sha256:ba94054c…` (archive), but release-body checksum = `cd9f764abfd0…` (binary inside). They differ. Linux/Windows raw binaries match (`cloudflared-linux-amd64` digest `5286698547…` == body `5286698547…`), so the bug is mac-specific. The plan's flow hashes the downloaded `.tgz` BEFORE extracting, then compares to a manifest hash populated from the release body → guaranteed mismatch on both mac targets.
- **Failure scenario:** CI Phase 4 macOS jobs fail at `verify-sidecar` step every run; or worse, dev populates manifest from the archive digest and the published release-body checksum audit no longer matches Cloudflare's stated value.
- **Evidence:** Live API `2026.5.2` — darwin tgz digest≠body; linux/windows digest==body. `phase-02` manifest `extract` directive + step-5 flow order.
- **Disposition:** ACCEPT
- **Rationale:** Real, verified, mac-only. Fix: for `extract: tgz:*` targets, extract FIRST then hash the extracted binary against the body checksum; for raw-binary targets hash the downloaded file directly. Document both hash sources in the manifest (or store the archive digest separately).

### Finding 3: Bundle fails — only `icon.png` (70 bytes) exists, no `.icns`/`.ico` — HIGH
- **Reviewer:** Assumption Destroyer / Fact Checker
- **Location:** Phase 3, Implementation step 11 (`phase-03-tauri-config-and-updater-key.md:127`)
- **Flaw:** Plan says "Confirm icon files exist in `src-tauri/icons/` (Tauri scaffolds them; if missing or placeholder, leave as-is — bundle will warn but not fail)." Reality: `src-tauri/icons/` contains only `icon.png` (70 bytes — a placeholder, almost certainly not valid). `dmg`/`nsis` bundling requires real `icon.icns` (macOS) and `icon.ico` (Windows); `cargo tauri build` **fails hard** when the configured icon is missing or invalid, it does not just warn.
- **Failure scenario:** First `--bundles dmg`/`nsis` run fails on icon resolution; Phase 6 dry-run blocked.
- **Evidence:** `ls src-tauri/icons/` → only `icon.png` (70 bytes). `phase-03:127`.
- **Disposition:** ACCEPT
- **Rationale:** Verified. Fix: add a Phase 3 step to generate the full icon set via `npm run tauri icon path/to/source.png` (produces `.icns`, `.ico`, and PNG set) and commit them. Correct the "will warn but not fail" claim.

### Finding 4: Plan references a `.setup()` anchor that does not exist in `lib.rs` — HIGH
- **Reviewer:** Assumption Destroyer / Contract Verifier
- **Location:** Phase 3, Risk Assessment (`phase-03-tauri-config-and-updater-key.md:156`)
- **Flaw:** Plan says "insert plugin call between existing `.setup()` and `.invoke_handler()` per Tauri docs". Actual `lib.rs` has NO `.setup()` — the chain is `tauri::Builder::default().invoke_handler(generate_handler![…]).run(generate_context!())` (`src-tauri/src/lib.rs:9-23`). The cited anchor doesn't exist.
- **Failure scenario:** Implementer follows the step literally, can't find `.setup()`, guesses placement, possibly puts `.plugin()` after `.run()` (no-op / compile context confusion).
- **Evidence:** `src-tauri/src/lib.rs:9-23` (no `.setup()`); `phase-03:156`.
- **Disposition:** ACCEPT
- **Rationale:** Verified inaccurate instruction. Fix: state the real chain — insert `.plugin(tauri_plugin_updater::Builder::new().build())` before `.invoke_handler(...)` on `Builder::default()`.

### Finding 5: Updater capability/permission never added — runtime updater calls denied — HIGH
- **Reviewer:** Security Adversary / Contract Verifier
- **Location:** Phase 3, Touchpoints (capability file absent from edit list)
- **Flaw:** `src-tauri/capabilities/default.json` grants only `["core:default"]` (`:6`). Tauri v2 plugin commands require explicit capability permissions; the updater plugin's check/download commands need `updater:default` (or the relevant allow-list) in a capability. The plan adds the plugin + config but never touches capabilities, so updater IPC calls are denied at runtime even after the plugin is registered.
- **Failure scenario:** Plugin registers, config valid, but calling the updater from the app (when wired) is blocked by the capability system; the Phase 6 auto-updater happy-path test cannot pass.
- **Evidence:** `src-tauri/capabilities/default.json:6`; plan Touchpoints lists no capability edit.
- **Disposition:** ACCEPT
- **Rationale:** Verified gap. Fix: add `updater:default` to `capabilities/default.json` permissions and list the file in Phase 3 touchpoints. (Note: actually invoking the updater from frontend/Rust is otherwise out of scope; minimally the permission must exist for the happy-path test.)

### Finding 6: Artifact count contradiction — "9 artifacts" vs "14 total" vs "15 release assets" — MEDIUM
- **Reviewer:** Assumption Destroyer / Scope Auditor
- **Location:** Phase 6 (`phase-06-portable-zip-and-dry-run-release.md:77` says "= 14 total"; `:138` says "= 15 release assets"); `plan.md:21` + Phase 4 say "9 artifacts + latest.json"
- **Flaw:** Counts disagree across files. Actual unique installers/payloads: 2 dmg + 2 app.tar.gz + 1 exe + 1 portable.zip + 1 deb + 1 AppImage = 8; sigs = 5 (2 app.tar.gz, exe, deb, AppImage); + latest.json. Total = 14. "9 artifacts" and "15" are both wrong.
- **Failure scenario:** Phase 6 `release-assets.test.mjs` asserts a wrong expected count → false test failure or a test rewritten to match the wrong number.
- **Evidence:** `phase-06:77`, `phase-06:138`, `plan.md:21`.
- **Disposition:** ACCEPT
- **Rationale:** Real internal inconsistency. Fix: standardize on "8 installer/payload files + 5 `.sig` + `latest.json` = 14 assets" everywhere; drop "9".

### Finding 7: Pinned cloudflared version `2026.5.1` is already superseded by `2026.5.2` — MEDIUM
- **Reviewer:** Fact Checker
- **Location:** Phase 2 manifest (`phase-02-sidecar-manifest-and-scripts.md` — `cloudflaredVersion: "2026.5.1"`); design NFR
- **Flaw:** Live latest is `2026.5.2` (published 2026-05-27). `2026.5.1` may still exist but the plan/design hardcode a stale version with TODO hashes.
- **Evidence:** Live API tag `2026.5.2`; `phase-02` manifest pins `2026.5.1`.
- **Disposition:** ACCEPT (low-effort)
- **Rationale:** Pin to `2026.5.2` and populate real hashes from the verified release body. Note the binary-vs-archive distinction from Finding 2 when populating mac hashes.

### Finding 8: `docs.test.mjs` markdown-structure test is gold-plating for a docs-only phase — MEDIUM (YAGNI)
- **Reviewer:** Scope & Complexity Critic / Scope Auditor
- **Location:** Phase 1, Implementation steps (`phase-01-docs-and-adr.md` — Red step adds `scripts/test/docs.test.mjs`)
- **Flaw:** Writing a Node test runner suite to assert markdown headings exist / regexes are absent, for a one-time doc edit, is process overhead with low regression value. The TDD framing forces a test where a manual diff + the Phase 2 script test infra suffices.
- **Evidence:** `phase-01` Red step.
- **Disposition:** REJECT (downgrade, not remove)
- **Rationale:** Borderline. The `getDiagnostics`/manual review covers it. BUT — per project steering, this is the user's `--tdd` choice; auditor YAGNI leans must not silently reverse a user decision. Recommendation: keep the assertion but fold it into the Phase 2 `scripts/test/` suite instead of a standalone Phase-1 file, rather than cutting it. Present to user; do not auto-apply.

## Summary
- Findings surfaced: 8 (after dedupe + evidence filter; all carry file:line)
- Severity: 2 Critical, 3 High, 3 Medium
- Disposition: 7 Accept, 1 Reject (downgrade)
- Biggest risk: Finding 1 (latest.json overwrite) — breaks the core updater feature the user explicitly chose.
