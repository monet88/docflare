---
name: backend-module-or-command-addition
description: Workflow command scaffold for backend-module-or-command-addition in docflare.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /backend-module-or-command-addition

Use this workflow when working on **backend-module-or-command-addition** in `docflare`.

## Goal

Adds a new backend module, command, or domain logic in Rust, including configuration and capability updates.

## Common Files

- `src-tauri/src/*/*.rs`
- `src-tauri/src/commands/*.rs`
- `src-tauri/src/domain/*.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/src/main.rs`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update Rust source files for the new module or command.
- Update Cargo.toml and Cargo.lock for dependencies.
- Update capability configuration files (e.g., capabilities/*.json).
- Modify main.rs or lib.rs to register new modules or commands.
- Add or update store implementations if secrets or storage are involved.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.