---
name: feature-development-with-tests-and-types
description: Workflow command scaffold for feature-development-with-tests-and-types in docflare.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-development-with-tests-and-types

Use this workflow when working on **feature-development-with-tests-and-types** in `docflare`.

## Goal

Implements a new feature or domain, including UI, types, and tests.

## Common Files

- `src/features/*/*.tsx`
- `src/features/*/*.ts`
- `src/features/*/*.test.tsx`
- `src/features/*/*.css`
- `src/features/*/*-types.ts`
- `src/lib/*`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update feature implementation files (e.g., .tsx, .ts).
- Add or update type definition files (e.g., onboarding-types.ts).
- Write or update corresponding test files (e.g., .test.tsx).
- Update shared libraries if needed (e.g., src/lib/tauri/profile.ts).
- Add or update CSS or UI assets if relevant.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.