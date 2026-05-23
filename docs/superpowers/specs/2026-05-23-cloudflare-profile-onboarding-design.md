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
- Helper text describing the required Cloudflare token resources and permissions:
  - Account: Cloudflare Tunnel Edit, or the current Cloudflare One Connector/cloudflared write permission that Cloudflare accepts for tunnel create/config operations.
  - Zone: DNS Edit.
  - Resources scoped to the submitted Account ID and Zone ID.

Basic client-side validation prevents empty values and obviously malformed whitespace before calling the backend. The frontend does not persist the token. After a successful save, the UI clears the raw token from component state and renders a saved profile summary:

- Account ID.
- Zone ID.
- Profile ID.
- Last validated timestamp.
- Token status shown as redacted/present, never as raw token text.

After onboarding, the app may show a placeholder next-state indicating that tunnel and route management come next. That placeholder is not a functional dashboard.

The API Token field uses password-style rendering, disables browser autocomplete, and is never echoed back after submit. Failed validation may keep the token only in volatile component state so the user can correct surrounding fields, but the token must not be stored in local storage, session storage, URL state, telemetry, error details, or debug output.

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
6. Run the permission preflight contract below.
7. Store the token through `SecretStore`.
8. Write non-secret metadata through `ProfileConfigStore`.
9. Return `SavedProfile`.

The backend performs the strongest non-mutating preflight available during onboarding. It must not create temporary DNS records or tunnels during this slice. If Cloudflare write permission cannot be proven without a mutating operation, the spec treats onboarding as a best-effort preflight plus explicit token-scope guidance. Later route/tunnel workflows still handle Cloudflare write failures as typed `InsufficientPermissions` errors.

## Cloudflare Permission Preflight Contract

The Cloudflare client uses `https://api.cloudflare.com/client/v4` and sends the submitted token only in the `Authorization: Bearer ...` header.

Preflight probes:

| Probe | Endpoint | Expected success | Domain error on failure |
|---|---|---|---|
| Token status | `GET /user/tokens/verify` | Response succeeds and token status is active/usable. | `InvalidToken` for 401/403, inactive, expired, not-yet-valid, or malformed token responses. |
| Account access | `GET /accounts/{accountId}` or `GET /accounts` filtered/matched by ID if the direct endpoint is unavailable for the token type. | The submitted account is visible to the token. | `AccountNotAccessible` for 403/404/no match. |
| Zone ownership | `GET /zones/{zoneId}` | Zone exists and response account ID equals submitted `accountId`. | `ZoneNotFoundOrMismatch` for 403/404/no match/account mismatch. |
| DNS read access | `GET /zones/{zoneId}/dns_records?per_page=1` | Request succeeds. | `InsufficientPermissions` with DNS context for 403. |
| Tunnel read access | `GET /accounts/{accountId}/cfd_tunnel?per_page=1` | Request succeeds. | `InsufficientPermissions` with tunnel context for 403. |

Write permissions:

- Cloudflare's route/tunnel MVP later needs DNS write for `POST /zones/{zoneId}/dns_records`.
- Cloudflare's tunnel MVP later needs tunnel write for `POST /accounts/{accountId}/cfd_tunnel` and `PUT /accounts/{accountId}/cfd_tunnel/{tunnelId}/configurations`.
- Onboarding does not perform write/delete probes because those mutate the user's Cloudflare account and can leave orphan DNS records or tunnels if cleanup fails.
- The UI must tell users to create a token with Zone DNS Edit and Account Cloudflare Tunnel Edit, or the equivalent current Cloudflare One Connector/cloudflared write permission accepted by Cloudflare.
- Route and tunnel implementation slices must keep typed write-failure handling even after onboarding succeeds.

API error mapping:

- 401/403 from token verify maps to `InvalidToken`.
- 403 from account access maps to `AccountNotAccessible`.
- 404/no-match from account access maps to `AccountNotAccessible`.
- 403/404/no-match from zone access maps to `ZoneNotFoundOrMismatch`, unless the account probe already failed.
- 403 from DNS or tunnel probes maps to `InsufficientPermissions`.
- 429 maps to `CloudflareRateLimited`.
- Network timeout, DNS failure, TLS failure, or non-JSON Cloudflare response maps to `CloudflareUnavailable`.
- Cloudflare error payloads are logged only after token redaction and never include the submitted token.

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
- `CloudflareRateLimited`: Cloudflare returned rate limiting.
- `CloudflareUnavailable`: Cloudflare could not be reached or returned an unusable response.
- `SecretStoreUnavailable`: Windows Credential Manager/keyring write failed.
- `ConfigWriteFailed`: local metadata write failed.

All errors returned to the frontend are safe to display. Raw tokens are never logged, never returned to the frontend after submission, and never included in command strings exposed to logs or UI.

## Persistence Commit Protocol

The service uses the same commit protocol for first save and profile replacement.

1. Read the current config, if any.
2. Generate a candidate secret reference, for example `cf-tunnel-desktop/default/api-token/candidate-{operationId}`.
3. Write the submitted token to the candidate secret reference.
4. Write config metadata atomically so `tokenSecretRef` points to the candidate reference. Atomic config write means temp-file write followed by same-directory replace where supported.
5. If the config write succeeds, return the new saved profile and delete the old secret reference if one existed.
6. If the config write fails, delete the candidate secret reference and leave the previous config and previous secret untouched.

Replacement rules:

- An existing working profile must survive a failed replacement.
- Deleting the old secret after a successful config commit is cleanup. If old-secret cleanup fails, the new profile remains active and the backend records a redacted cleanup warning for later retry.
- The frontend sees a replacement as the same `profileId` with updated metadata; multi-profile UI remains out of scope.

## Testing Strategy

Rust tests:

- Validation failure writes neither secret nor config.
- Validation success writes secret and non-secret metadata.
- First-save config write failure after candidate secret write deletes the candidate secret.
- Replacement config write failure deletes the candidate secret and preserves the previous profile and previous secret.
- Cloudflare account mismatch returns `ZoneNotFoundOrMismatch`.
- Missing DNS or tunnel permission returns `InsufficientPermissions`.
- Cloudflare rate limiting returns `CloudflareRateLimited`.
- Cloudflare network/invalid response failures return `CloudflareUnavailable`.
- Saved profile response never includes raw token.
- Fake Cloudflare contract cases cover 401/403 token rejection, account forbidden, account missing, zone missing, zone-account mismatch, DNS forbidden, tunnel forbidden, rate limit, and network failure.

Frontend tests:

- Empty fields block submit.
- Submit shows loading state and disables duplicate submits.
- Success clears token input and shows redacted saved profile.
- Typed backend errors render specific user-facing messages.
- API Token input uses password-style rendering, disables autocomplete, and does not persist to browser storage.

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
- Replacing an existing profile preserves the old working profile if the new config commit fails.
- UI shows loading, success, and specific error states.
- Saved profile view never displays or receives the raw token.
- Tests cover validation success, validation failure, rollback, and core UI states.

Expected evidence:

- Rust tests run from `src-tauri` with `cargo test` after the scaffold exists.
- Frontend tests run with the package test script created by the scaffold, expected as `npm test` or `npm run test`.
- Desktop smoke run uses the Tauri dev script created by the scaffold, expected as `npm run tauri dev`.
- Manual validation report confirms no raw token in config JSON, no raw token in UI responses/logs, and the expected Windows Credential Manager/keyring entry exists only after successful validation.

## Implementation Notes For Planning

- Treat this as a high-risk story because it touches external provider behavior and secret handling.
- Keep the scaffold small; do not prebuild unrelated MVP screens.
- Prefer fake Cloudflare and fake stores in automated tests. Real Cloudflare validation belongs in manual validation or explicitly gated integration tests.
- The current Harness database is not initialized in this checkout; planning should account for `scripts/harness query matrix` failing until `harness init` is run.
- The local git repository should be initialized before committing this spec if the checkout was unpacked without `.git` metadata.

Cloudflare references checked for planning:

- API token verify: `https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/`
- Accounts API: `https://developers.cloudflare.com/api/resources/accounts/`
- Zones API: `https://developers.cloudflare.com/api/resources/zones/`
- DNS records API: `https://developers.cloudflare.com/api/resources/dns/subresources/records/`
- Cloudflared tunnels API: `https://developers.cloudflare.com/api/node/resources/zero_trust/subresources/tunnels/subresources/cloudflared/`
- Tunnel setup token permissions: `https://developers.cloudflare.com/tunnel/setup/`
