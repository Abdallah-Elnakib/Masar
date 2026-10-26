# Release v4.1.2

New Features
- Added a system monitoring page for administrators to review application health, database connectivity, user sessions, devices, and reported system events.
- Added a Support Center where users can submit tickets and track their status. Administrators can review tickets, reply, and update their progress.
- Added encrypted page-data caching for supported pages. Cached data is reused for up to 24 hours, and users can refresh a page manually whenever they need the latest information.
- Added release notes to update notifications so users can see what is included in each new version.

Improvements
- Improved page loading by saving cached data in the background instead of making users wait for the cache write to finish.
- Redesigned the Support page for a clearer, more organized experience, with improved readability in dark mode.
- Kept system monitoring data live so health and performance information is not shown from an outdated cache.

Fixes
- Fixed the Support page connection issue that could prevent tickets from loading.
- Improved application stability when handling update notifications and closing the desktop app.
