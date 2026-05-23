# Cloudflare Profile Onboarding Design

Date: 2026-05-23
Status: Draft for user review
Source: `project-overview-pdr.md`

## Summary

Build the first vertical slice of CF Tunnel Desktop: Cloudflare profile onboarding.

The slice scaffolds a minimal Tauri + React application and implements one complete flow from UI to backend storage:

1. User enters Cloudflare API Token, Account ID, and Zone ID.
2. User clicks Test Connection.
3. Rust backend validates the token, account, zone, and required MVP permissions against Cloudflare.
4. If validation succeeds, the backend stores the token in Windows Credential Manager through a `SecretStore` abstraction and writes only non-secret metadata to local JSON config.
5. UI displays a saved redacted profile.

The MVP supports one Cloudflare profile. Internal data still includes a stable `profileId` so multi-profile support can be added later without reshaping the entire model.

## Scope

In scope:

- Minimal Tauri v2 + React + TypeScript + Vite scaffold.
- Onboarding form with API Token, Account ID, and Zone ID fields.
- Test Connection action with loading, success, and error states.
- Tauri command to validate and save the profile.
- Cloudflare validation for token validity, account access, zone ownership, and MVP-required permissions.
- Local config metadata persistence with no raw secrets.
- `SecretStore` abstraction with production Windows Credential Manager implementation and fake/in-memory test implementation.
- Saved profile summary with redacted token state.
- Focused Rust and frontend tests for the onboarding slice.

Out of scope:

- Creating or running Cloudflare tunnels.
- Creating, editing, disabling, or deleting routes.
- Full dashboard, log console, settings screen, tray menu, or autostart workflow.
- Docker label scanning, OAuth, multi-host sync, Cloudflare Access policies, or auto-discovery.
- Multiple Cloudflare profiles in the UI.

## User Experience

The first screen is the onboarding form. It contains:

- API Token input.
- Account ID input.
- Zone ID input.
- Test Connection button.
- Inline validation and typed backend error display.

Basic client-side validation prevents empty values and obviously malformed whitespace before calling the backend. The frontend does not persist the token. After a successful save, the UI clears the raw token from component state and renders a saved profile summary:

- Account ID.
- Zone ID.
- Profile ID.
- Last validated timestamp.
- Token status shown as redacted/present, never as raw token text.

After onboarding, the app may show a placeholder next-state indicating that tunnel and route management come next. That placeholder is not a functional dashboard.

## Backend Architecture

The backend is organized around small boundaries:

- `ProfileCommand`: exposes Tauri commands such as `validate_and_save_profile(input)` and `get_profile()`.
- `ValidationService`: coordinates Cloudflare validation and persistence.
- `CloudflareClient`: calls Cloudflare APIs for account, zone, DNS, and tunnel permission checks.
- `ProfileConfigStore`: reads and writes local non-secret profile metadata.
- `SecretStore`: trait for secret persistence.
- `KeyringSecretStore`: production `SecretStore` backed by Windows Credential Manager via Rust `keyring`.
- `FakeSecretStore`: test implementation.

Dependency direction:

```text
React UI -> Tauri commands -> ValidationService
ValidationService -> CloudflareClient
ValidationService -> SecretStore
ValidationService -> ProfileConfigStore
```

The UI does not call Cloudflare directly. Config storage does not know about Cloudflare. Secret storage does not know validation details. The Cloudflare client does not know how profiles are persisted.

## Data Model

`CloudflareProfileMetadata` is stored in local JSON:

```json
{
  "profileId": "default",
  "accountId": "account-id",
  "zoneId": "zone-id",
  "tokenSecretRef": "cf-tunnel-desktop/default/api-token",
  "lastValidatedAt": "2026-05-23T00:00:00Z"
}
```

The config file must not contain:

- API Token.
- Tunnel token.
- Full command-line strings that include secrets.

`SavedProfile` returned to the UI contains only redacted state:

```json
{
  "profileId": "default",
  "accountId": "account-id",
  "zoneId": "zone-id",
  "tokenPresent": true,
  "lastValidatedAt": "2026-05-23T00:00:00Z"
}
```

## Validation Flow

`validate_and_save_profile(input)` performs one backend operation:

1. Validate input shape.
2. Call Cloudflare with the submitted API token.
3. Confirm the token is accepted.
4. Confirm the token can access `accountId`.
5. Confirm `zoneId` exists and belongs to `accountId`.
6. Confirm required MVP permissions are present or practically usable:
   - DNS record management for the zone.
   - Cloudflare Tunnel read/write capability for the account.
7. Store the token through `SecretStore`.
8. Write non-secret metadata through `ProfileConfigStore`.
9. Return `SavedProfile`.

The backend validates the permissions needed by later MVP tunnel and route workflows during onboarding. A saved profile should mean the user can proceed to route/tunnel management without discovering missing Cloudflare permissions later.

## Failure And Rollback

If Cloudflare validation fails, the backend writes nothing:

- No config write.
- No keyring write.
- No saved profile response.

Typed errors:

- `InvalidToken`: token rejected by Cloudflare.
- `AccountNotAccessible`: token cannot access the submitted account.
- `ZoneNotFoundOrMismatch`: zone does not exist or does not belong to the account.
- `InsufficientPermissions`: token lacks MVP-required DNS or tunnel permissions.
- `SecretStoreUnavailable`: Windows Credential Manager/keyring write failed.
- `ConfigWriteFailed`: local metadata write failed.

If the token write succeeds but config write fails, `ValidationService` rolls back the just-written token to avoid orphan secrets.

All errors returned to the frontend are safe to display. Raw tokens are never logged, never returned to the frontend after submission, and never included in command strings exposed to logs or UI.

## Testing Strategy

Rust tests:

- Validation failure writes neither secret nor config.
- Validation success writes secret and non-secret metadata.
- Config write failure after secret write deletes the secret.
- Cloudflare account mismatch returns `ZoneNotFoundOrMismatch`.
- Missing DNS or tunnel permission returns `InsufficientPermissions`.
- Saved profile response never includes raw token.

Frontend tests:

- Empty fields block submit.
- Submit shows loading state and disables duplicate submits.
- Success clears token input and shows redacted saved profile.
- Typed backend errors render specific user-facing messages.

Manual Windows validation:

- Run the app on Windows.
- Submit a real Cloudflare API Token, Account ID, and Zone ID.
- Confirm local config JSON contains no raw token.
- Confirm Windows Credential Manager/keyring contains the token entry.
- Confirm failed validation leaves no saved config and no credential entry.

## Acceptance Criteria

- Minimal Tauri + React app starts locally.
- User can submit API Token, Account ID, and Zone ID from the onboarding UI.
- Backend validates token, account, zone, and MVP permissions in one command.
- Successful validation stores token only in Windows Credential Manager/keyring and stores only metadata in local JSON.
- Failed validation stores nothing.
- UI shows loading, success, and specific error states.
- Saved profile view never displays or receives the raw token.
- Tests cover validation success, validation failure, rollback, and core UI states.

## Implementation Notes For Planning

- Treat this as a high-risk story because it touches external provider behavior and secret handling.
- Keep the scaffold small; do not prebuild unrelated MVP screens.
- Prefer fake Cloudflare and fake stores in automated tests. Real Cloudflare validation belongs in manual validation or explicitly gated integration tests.
- The current Harness database is not initialized in this checkout; planning should account for `scripts/harness query matrix` failing until `harness init` is run.
- The local git repository should be initialized before committing this spec if the checkout was unpacked without `.git` metadata.
