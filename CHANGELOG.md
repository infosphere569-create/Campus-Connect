# Changelog
## v0.3.0
- Centralized Firestore collection/status constants.
- Added profile update and validated avatar-upload helpers.
- Added dedicated Firestore and Storage security-rule files.
- Added Firebase CLI deployment configuration.
- Strengthened private anonymous-issue data boundary.

## v0.4.0
- Shared reaction, save, comment, event-interest and group-request helpers.
- Moderation helpers with audit logging.
- Common Firestore indexes for feed, comments, notifications, issues and events.

## v0.5.0
- Added trusted Firebase callable for anonymous issue creation.
- Added server-side private UID retention for anonymous issues.
- Added admin/moderator notifications for new issues and reports.
- Added onboarding profile page for richer student profiles.
- Locked direct client writes to issuePrivate.

## v0.6.0
- Added automatic onboarding redirect for incomplete student profiles.
- Wired anonymous issue submission to the trusted callable function.
- Added a live unread-notification indicator to the app shell.
- Removed insecure client-side writes to issuePrivate from the issue flow.

## v0.7.0
- Added shared data layer for saved posts, groups, event interest and membership state.
- Added profile collection hydration hooks for saved posts, groups and interested events.
- Added persistent event-interest and group-membership state helpers.
- Added JS smoke-test script.

## v0.8.0
- Added real-time Firestore notification listener and unread badge support.
- Added shared toast/busy UI helpers.
- Added moderation queue data services for reports, pending groups and active issues.
- Added live notification integration hooks.

## v0.9.0
- Added trusted Cloud Functions for user suspension/reactivation and role changes.
- Added trusted group approval function.
- Added admin data layer for users, reports, issues, groups, events and audit logs.
- Added admin control client helpers and management workspace.

## v1.0.0
- Added live admin dashboard metrics and management UI.
- Added pending-group approval controls.
- Added user suspend/reactivate controls through trusted Functions.
- Added responsive admin metric grid and management tables.
- Added safe database-to-DOM escaping in admin UI.

## v1.1.0
- Added privacy and notification settings persistence.
- Added basic cross-collection global search using normalized prefix fields.
- Added search UI helper with debounce.
- Added bounded freshness/quality/relevance feed ranking helper.
- Added dedicated settings page.

## v1.3.0
- Normalized Firebase CDN imports to 12.2.1.
- Added reusable post/comment ownership actions.
- Added cursor-based feed pagination helper and Load more control.
- Added trusted group member approve/reject/remove callables.
- Added group-admin callable client helpers.

## v1.8.0 — Final cumulative build
- Added production interaction service for likes, saves, comments and event interest.
- Added live notification page listener.
- Added safe public-profile shaping.
- Added normalized search-field utilities.
- Added image lazy-loading/performance helpers and reduced-motion support.
- Added trusted report-review callable.
- Fixed admin role operator precedence bug.
- Added deployment and final QA checklists.
- Preserved all previous v0.1 → v1.7 cumulative files and functionality.
