# 0006 CF Tunnel Seed Spec Intake & Decomposition

Date: 2026-05-23

## Status

Accepted

## Context

A detailed `project-overview-pdr.md` (~202 lines) existed at the repository root and was actively used as the "Source" for the first vertical slice design (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md`).

This arrangement violated core harness principles:
- Monolithic living spec (explicitly discouraged in decision 0003, HARNESS.md §Spec Lifecycle, FEATURE_INTAKE.md, and docs/product/README.md).
- Wrong location (root instead of `docs/product/`).
- One-way references with no backlinks or "current truth" pointer.
- Contained a placeholder bug (empty-file SHA256).

The harness model (decision 0003 + 0002) requires treating user-provided specs as **input material** that is decomposed once into small, living product contracts under `docs/product/`. The original seed remains only as historical snapshot.

## Decision

1. Treat the original root PDR as an immutable historical seed specification.
2. Move it to `docs/product/seed/2026-05-23-cf-tunnel-project-overview-pdr.md` with a clear "do not edit" header.
3. Decompose its content into five focused, maintainable living product contracts:
   - `overview.md`
   - `security-and-secrets.md`
   - `data-models-and-routes.md`
   - `non-functional-requirements.md` (with real SHA remediation guidance)
   - `acceptance-criteria.md`
4. Update all known consumers to point to the new current contracts (with historical seed pointer).
5. Record this intake as the present decision.
6. Fix the SHA placeholder with an explicit, actionable TODO.

## Alternatives Considered

1. Minimal in-place patch on the root file — Rejected (does not fix root-cause process violation).
2. Simple relocate without decomposition — Rejected (still leaves a monolithic living spec).
3. Full decomposition + historical seed (this decision) — Accepted (full compliance with harness model).

## Consequences

Positive:
- All original optimization findings resolved (location, monolithic violation, missing backlinks, SHA bug, structure).
- CF Tunnel product now follows the documented harness contract lifecycle.
- Future slices (routes, tunnels, tray, autostart, etc.) have clear, small contracts to maintain.
- The repo now contains a real worked example of bringing an external detailed spec into the harness.

Tradeoffs:
- One-time migration cost (already paid).
- The detailed onboarding design and its review snapshot now contain a short historical note.
- Real SHA256 for the pinned 2026.5.1 cloudflared binary must still be obtained from the official release (documented as TODO).

---

> This decision was created as part of the 2026-05-23 formal seed intake of the CF Tunnel project overview.