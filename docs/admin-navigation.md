# Admin navigation and loading

- Users lives at `/admin/users`; `/admin` redirects there.
- Activity Log lives at `/admin/activity-log`; `/admin/activity` redirects there.
- Missions, name cases, and the design-system catalogue remain admin-only.

`app/admin/layout.tsx` owns the persistent app shell and admin access gate.
Pages do not mount another sidebar or site title bar. The gate uses the root
AuthProvider's verified user and app-metadata role. All retained admin API
handlers still enforce authorization independently on every request.

Use `PageLoading` inside that shell for page data. It is a large preset of the
canonical `Loading` animation/quote, not a fixed overlay or a separate animation.
Reserve `FullScreenLoading` for initial authentication and standalone flows.

## Retired features

Form Audit, admin Notifications/broadcasting, and admin Settings/Maintenance
have been removed, including their pages, exclusive components, and endpoints.
The root no longer fetches or enforces maintenance mode. Personal account
settings and shared iOS push/Live Activity infrastructure are not removed.

Existing database data and historical migrations are preserved. In particular,
the historical `app_config.maintenance_mode` entry is inert; this update does
not delete the shared configuration table or affect unrelated records.
