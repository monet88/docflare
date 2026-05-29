# Product Docs

This directory is intentionally generic and mostly empty in Harness v0.

When a user provides a project spec, derive smaller product contract files here
instead of keeping one large spec as the living plan. Name files by the product
domains that actually exist in that spec, for example `overview.md`,
`billing.md`, `workflows.md`, `permissions.md`, or `api-conventions.md`.

Do not create domain files before the spec just to fill the folder. Empty
structure is healthier than fake product truth.

## Update Rule

When behavior changes:

1. Update the affected product doc.
2. Update or create the story packet.
3. Update durable proof status with `scripts/harness story add` or
   `scripts/harness story update`.
4. Record a decision if the change affects architecture, scope, risk, or a
   previously settled product rule.

## Current Product Contracts (CF Tunnel Desktop)

As of the 2026-05-23 seed intake (decision 0006), the following living contracts exist for the CF Tunnel Desktop effort:

- `overview.md`
- `security-and-secrets.md`
- `data-models-and-routes.md`
- `non-functional-requirements.md` (includes pinned sidecar + SHA guidance)
- `acceptance-criteria.md`

Historical seed snapshot (do not edit): `seed/2026-05-23-cf-tunnel-project-overview-pdr.md`
