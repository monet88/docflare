---
phase: 3
title: "Route management UI"
status: pending
effort: "3h"
dependencies: ["2"]
---

# Phase 3: Route management UI

## Overview
Add a route management page with a table listing all routes assoicated with the active profile, plus add/edit/delete actions. The UI reuses the existing design tokens and layout patterns from the onboarding page.

## Requirements

**Functional:**
- Table showing routes: hostname, target, created date, profile name.
- "Add route" button opens inline form (hostname + target fields).
- Edit: inline edit of hostname/target for an existing route.
- Delete: remove route with confirmation dialog.
- Filter by active profile (no tunnels page).
- Validation errors shown inline near the relevant field.

**Non-functional:**
- No raw identifiers rendered unnecessarily (hostname/target are user-defined, not secrets).
- Form validation: hostname no scheme, target must be http(s)://host:port. Inline per-field error messages (same pattern as onboarding form).
- Responsive: collapse to single-column on mobile.

## Architecture
New page component `RouteManagementPage` under `src/features/routes/`. Uses the same `ProfileApi` contract pattern from the onboarding code. Shares design tokens from `onboarding.css`.

```
src/features/routes/
  route-management-page.tsx    # container: loads profiles+routes, owns state
  route-table.tsx              # presentational table
  route-form.tsx               # add/edit form
  route-management.css         # scoped styles
```

## Related Code Files
- **Create:** `src/features/routes/route-management-page.tsx`, `route-table.tsx`, `route-form.tsx`, `route-management.css`, `src/lib/tauri/route.ts`
- **Modify:** `src/app.tsx` (add tab bar + route page), `src/features/onboarding/onboarding-form.test.tsx` (no changes needed — RouteApi is separate)

## Implementation Steps
1. Create `src/lib/tauri/route.ts` with separate `RouteApi` interface and `tauriRouteApi` implementation: `getRoutes(profileId)`, `addRoute(input)`, `updateRoute(id, profileId, input)`, `deleteRoute(id, profileId)`.
2. Create `route-management-page.tsx` — loads routes via RouteApi, filters by active profile.
3. Create `route-table.tsx` — renders routes in a table with edit/delete action buttons.
4. Create `route-form.tsx` — controlled form for hostname + target, inline per-field validation errors (same pattern as onboarding form). Handle `DuplicateHostname`, `InvalidHostname`, `InvalidTarget`, `RouteNotFound` error codes from backend.
5. Wire into `app.tsx` with a simple tab bar (Profiles | Routes) to switch between onboarding and routes pages. Show Routes tab only when at least one profile exists.

## Success Criteria
- [ ] Route table renders and shows "No routes" when empty.
- [ ] Add route form validates: rejects empty hostname, empty target, non-http target, hostname with scheme.
- [ ] Successful add refreshes the table and clears the form.
- [ ] Edit updates hostname/target in-place.
- [ ] Delete shows confirm dialog and removes route from table on confirm.
- [ ] Table filters to show only the active profile's routes.
- [ ] `npm run build` and `npm run lint` pass.
