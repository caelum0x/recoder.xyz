# Recoder Agency Role Matrix

## Roles

- `admin`: full control over team settings, billing, and all agency admin mutations.
- `ops`: delivery operations visibility and monitoring (read-oriented).
- `pm`: project/program visibility and planning views (read-oriented).
- `member`: internal collaborator baseline access.
- `client`: client-portal-only access.

## Critical Route Policy

- Admin mutations (`app/(admin)/**/actions.ts`, delivery exports) require `admin`.
- Admin UI shell (`app/(admin)/layout.tsx`) requires internal team role (`admin`, `member`, `ops`, or `pm`).
- Client portal shell (`app/(client)/layout.tsx`) requires a mapped `clients.supabase_user_id`.

## Notes

- Role values are DB-constrained by migration `0094_agency_roles.sql`.
- Use `requireAdminRole` / `requireCurrentTeamRole` from `services/teams` for server-side enforcement.
