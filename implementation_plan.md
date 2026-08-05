# Dynamic Permissions Implementation Plan

## Goal Description

The user recently updated their hunter name to "拾壤" (Sensesoil) in the Google Permission Sheet and expected the Next.js app to immediately grant them their admin privileges. However, because NextAuth caches the user's `hunterName` and `roles` inside a JWT cookie (valid for 30 days), the application continues to use the stale roles and hunter name from the cookie, leading to permission errors across the dashboard (such as missing the hunter dropdown in `basic-mission`). 

To resolve this, the system needs to dynamically fetch and compare the Google Permission Sheet's data on-the-fly rather than relying solely on the cached session.

## Proposed Changes

### 1. New API Route for Dynamic Permissions
#### [NEW] `src/app/api/auth/permissions/route.ts`
- Create a new API route that retrieves the currently logged-in user via `auth()`.
- If a user is logged in, it will call `checkPermissions(session.user.email)` (which hits the 30s cache of the Google Sheet).
- Return the fresh `roles` and `hunterName`.

### 2. Client-Side Dynamic Permissions Hook
#### [NEW] `src/hooks/useDynamicPermissions.ts`
- Implement a reusable SWR hook `useDynamicPermissions()` that fetches `/api/auth/permissions`.
- This hook will return the current `hunterName`, `roles`, and a loading state, serving as a drop-in replacement for `(session?.user as any)?.roles` in client components.

### 3. Update Client Components
Replace `session.user.roles` and `session.user.hunterName` with the values returned from `useDynamicPermissions()` in the following pages:
#### [MODIFY] `src/app/basic-mission/page.tsx`
#### [MODIFY] `src/app/hidden-mission/page.tsx`
#### [MODIFY] `src/app/running-records/page.tsx`
#### [MODIFY] `src/app/hunting-mgmt/page.tsx`
#### [MODIFY] `src/app/diversion/page.tsx`

### 4. Update Server API Routes
Server-side APIs for Google Sheets also currently rely on the stale JWT cookie to verify read/write access. We need to update these to check the permissions directly.
#### [MODIFY] `src/app/api/sheets/[sheetKey]/route.ts`
- Fetch dynamic permissions via `checkPermissions(session.user.email)`.
#### [MODIFY] `src/app/api/sheets/hidden-mission/route.ts`
- Fetch dynamic permissions via `checkPermissions(session.user.email)`.
#### [MODIFY] `src/app/api/sheets/running-records/route.ts`
- Fetch dynamic permissions via `checkPermissions(session.user.email)`.

## Verification Plan
1. Check that the Next.js app compiles successfully.
2. The user will refresh their browser on the `basic-mission`, `hidden-mission`, and `running-records` pages. 
3. The app should dynamically fetch the permissions for "拾壤" and grant the admin controls (including the user switching dropdowns) automatically without requiring the user to clear cookies or relogin.
