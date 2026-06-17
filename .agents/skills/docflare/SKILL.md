```markdown
# docflare Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the core development patterns, coding conventions, and workflows used in the `docflare` repository. The project is a Rust-based backend (with Tauri) and a Vite-powered frontend, following strong conventions for code organization, commit messages, and testing. You'll learn how to add new features, backend commands, CI/CD pipelines, and documentation, all while adhering to the project's style and workflow automation.

---

## Coding Conventions

### File Naming

- **CamelCase** is used for file names:
  - Example: `onboardingTypes.ts`, `userProfile.tsx`

### Imports

- **Mixed import styles** are used:
  ```ts
  // Named import
  import { useProfile } from './profile';

  // Default import
  import Profile from './profile';

  // Namespace import
  import * as ProfileUtils from './profileUtils';
  ```

### Exports

- **Named exports** are preferred:
  ```ts
  // Good
  export function useProfile() { ... }
  export const PROFILE_DEFAULTS = { ... };

  // Avoid default exports when possible
  ```

### Commit Messages

- **Conventional commit format** is used:
  - Prefixes: `feat`, `docs`, `chore`, `ci`
  - Example: `feat: add onboarding UI and types`
  - Average length: ~65 characters

---

## Workflows

### Feature Development with Tests and Types

**Trigger:** When adding a new user-facing feature or domain logic  
**Command:** `/new-feature`

1. Create or update feature implementation files (e.g., `.tsx`, `.ts`).
2. Add or update type definition files (e.g., `onboardingTypes.ts`).
3. Write or update corresponding test files (e.g., `.test.tsx`).
4. Update shared libraries if needed (e.g., `src/lib/tauri/profile.ts`).
5. Add or update CSS or UI assets if relevant.

**Example:**
```ts
// src/features/onboarding/onboardingTypes.ts
export interface OnboardingState {
  step: number;
  completed: boolean;
}
```
```tsx
// src/features/onboarding/Onboarding.test.tsx
import { render } from '@testing-library/react';
import { Onboarding } from './Onboarding';

test('renders onboarding step', () => {
  render(<Onboarding />);
  // assertions...
});
```

---

### Backend Module or Command Addition

**Trigger:** When adding a new backend capability, command, or domain logic  
**Command:** `/new-backend-command`

1. Create or update Rust source files for the new module or command.
2. Update `Cargo.toml` and `Cargo.lock` for dependencies.
3. Update capability configuration files (e.g., `capabilities/*.json`).
4. Modify `main.rs` or `lib.rs` to register new modules or commands.
5. Add or update store implementations if secrets or storage are involved.

**Example:**
```rust
// src-tauri/src/commands/export.rs
pub fn export_data() {
    // Implementation
}
```
```rust
// src-tauri/src/main.rs
mod commands;
fn main() {
    // Register new command
}
```

---

### CI/CD Pipeline or Script Addition

**Trigger:** When automating testing, building, or releasing across platforms  
**Command:** `/new-ci-pipeline`

1. Create or update GitHub Actions workflow files (e.g., `ci.yml`, `release.yml`).
2. Add or update scripts for build, verification, or deployment (e.g., `.mjs` scripts).
3. Add or update test scripts for automation.
4. Update configuration files (e.g., `tauri.conf.json`) as needed.

**Example:**
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test
```
```js
// scripts/build.mjs
import { build } from 'vite';
await build();
```

---

### Architecture and Feature Planning Documentation

**Trigger:** When documenting new features, architectural decisions, or planning phases  
**Command:** `/new-docs-plan`

1. Create or update ADRs (`docs/decisions/*.md`).
2. Add or update feature plans and phase breakdowns (`plans/*/phase-*.md`, `plans/*/plan.md`).
3. Update product documentation (`docs/product/*.md`, `docs/ARCHITECTURE.md`, `README.md`).
4. Add or update templates for stories, specs, or decisions (`docs/templates/*`).

**Example:**
```markdown
<!-- docs/decisions/0001-initial-architecture.md -->
# ADR 0001: Initial Architecture
Date: 2024-05-01

## Status
Accepted

## Context
...
```

---

## Testing Patterns

- **Framework:** [Vitest](https://vitest.dev/)
- **Test files:** Named with `.test.tsx` suffix and placed alongside feature files.
- **Example:**
  ```tsx
  // src/features/user/User.test.tsx
  import { render } from '@testing-library/react';
  import { User } from './User';

  test('renders user name', () => {
    render(<User name="Alice" />);
    // assertions...
  });
  ```

---

## Commands

| Command               | Purpose                                                      |
|-----------------------|--------------------------------------------------------------|
| /new-feature          | Start a new user-facing feature with types and tests         |
| /new-backend-command  | Add a new backend Rust module, command, or capability        |
| /new-ci-pipeline      | Add or update CI/CD workflows or automation scripts          |
| /new-docs-plan        | Add or update documentation, ADRs, or feature planning docs  |
```
