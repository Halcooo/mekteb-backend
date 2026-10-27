# Mekteb E-Dnevnik Backend

Node.js 22.14+ / Express / TypeScript API for MySQL 8 and reviewed MariaDB 10.11 hosting. HTTP routes use `/backend/api`; live notifications use `/backend/ws/notifications`.

## HTTPS hosting i buduće objave

[Plan svakog budućeg deploya](deploy/DEPLOY_RUNBOOK.md) vodi pripremu, kopiju baze, probne migracije, aktivaciju, provjere i povratak. [cPanel postupak](deploy/CPANEL_DEPLOY.md) i [test telefona](deploy/PHONE_TEST.md) sadrže detalje. `npm run release:prepare` pravi zajednički backend/frontend paket s SHA-256 manifestom, bez tajni i korisničkih podataka. `npm run test:deployment` provjerava produkcijske CLI ulaze i zaseban cron na označenoj testnoj instanci.

Stvarni hosting je provjeren 27.10.2026: MariaDB 10.11.10, postojeća aplikacija Development/Node 22.8.0, ponuđen Node 24.6.0. Odobreni SSH ključ omogućava SFTP; shell nije omogućen. Privatni backup koda/slika/configa je sačuvan, a kopija baze uspješno vraćena u odvojenu hosting bazu. Prelaz stare sheme i migracije 005–006 prošli su na kopiji uz iste hash-eve izvornih zapisa. Hosting preflight i funkcionalna HTTP proba prijave, sesija, chata, notifikacija i konkurentnog push reda prolaze. Push transport u probi je simuliran; prijem na telefonu se provjerava poslije aktivacije. Stvarni deploy status je u runbook-u.

Za poznatu staru shemu bez evidencije koristiti `legacy-plan`, pa tek poslije provjerenog restore-a i pauziranja upisa eksplicitni `upgrade-legacy --confirm-backup-restored --confirm-writes-paused`. Postupak čuva zapise i provjerava 000–004 prije evidencije; obični `up` zatim dodaje 005–006. `npm run test:legacy` provjerava odbijanje konflikata i očuvanje podataka na označenoj lokalnoj testnoj instanci.

**Aktivno izdanje 27.10.2026:** `20261027T202834552Z-cpanel`, Node 24.6.0 / Production. Produkcijske migracije i preflight, 8 javnih HTTPS provjera i stvarni push cron prolaze. Završni test na telefonu vlasnik je odgodio. Za naredno izdanje krenuti od kratkog toka na početku [DEPLOY_RUNBOOK.md](deploy/DEPLOY_RUNBOOK.md); jednokratni legacy prelaz se ne ponavlja.

`npm run security:check` provjerava Git kandidate bez prikazivanja vrijednosti tajni; `-- --staged` provjerava tačne Git blobove prije commita. Provjera pokriva privatne putanje, env datoteke, ključeve, poznate token obrasce i, uz privatne `--reference` datoteke, podudaranje stvarnih tajni. To je dodatak pregledu diff-a, ne garancija otkrivanja svake moguće tajne.

## Plan provjere aplikacije — 27.10.2026.

U zajedničkom radnom direktoriju dostupni su [plan provjere](../mekteb-e-dnevnik/docs/PLAN_PROVJERE.md) i [rezultati izvršene lokalne provjere](../mekteb-e-dnevnik/docs/REZULTATI_PROVJERE.md). Prošlo je 108 backend testova, 18 funkcionalnih HTTP testova na stvarnom izdvojenom MySQL-u te zasebna integracijska provjera migracija, trajnih sesija, transakcijskog chata i push reda. Proba kopiranja/vraćanja baze poredi sve redove 14 tabela. Frontend ima 42 uspješna testa, lint i build. Dostava na fizički telefon i produkcijski hosting imaju zasebnu, još neizvršenu provjeru.

Efendija i vlasnik projekta koriste dva zasebna računa s ulogom `admin`; oba imaju postojeće administratorske ovlasti. Posebna uloga `superadmin` nije implementirana. Priprema više administratora podržana je postojećim `admin:create` postupkom s različitim imenima/email adresama. U provjeri su korišteni samo izmišljeni računi u privremenoj bazi. Stvarni računi nisu kreirani. Unos prisustva ostaje administratorska radnja. Lične sesije i sandučić obavijesti ostaju odvojeni za svaki račun.

Backend dio nove provjere uključuje sve registrovane API rute, odbijanje pristupa tuđim podacima, migracije do 006, trajne sesije, poruke bez duplikata, transakcije obavijesti i red push dostave. Testiranje baze radi se na zasebnoj označenoj instanci. Testovi sa zamjenskim push transportom i stvarna dostava na HTTPS okruženju/fizičkim telefonima imaju odvojene rezultate.

## Local setup

1. Run `npm ci` with Node.js 22.14 or newer.
2. Copy `.env.example` to `.env.development` and configure a database created for this project.
3. Generate two different random secrets of at least 32 bytes. Run `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` separately for each secret. `JWT_SECRET` signs access tokens; `JWT_REFRESH_SECRET` is the server-side pepper for refresh-token hashes. Do not reuse previously committed values.
4. Run `npm run migrate:status`. For a new empty database, run `npm run migrate:up`; for an existing installation, follow the adoption procedure below first.
5. Create the first administrator with `npm run admin:create`, supplying the five environment variables described below. Public registration always creates a parent account.
6. Run `npm run dev`. The default API URL is `http://localhost:5000/backend/api`.

Configuration loads from `.env.<NODE_ENV>`, or `.env` when the named file is absent. Existing process variables take priority. Tests skip these files entirely. Use `DB_PASS` for the database password.

Production requires `NODE_ENV=production` and exact HTTPS origins in `FRONTEND_URL`, separated by commas with no trailing slash. Wildcards are rejected. Configure `TRUST_PROXY_HOPS` only after verifying the exact proxy topology; the default uses the direct peer IP for rate limiting.

## Commands and tests

| Command | Purpose |
|---|---|
| `npm run dev` | Start the TypeScript development server |
| `npm run typecheck` | Check source and test types without emitting files |
| `npm test` | Unit/security regression tests with mocked database access |
| `npm run test:integration` | Opt-in tests against a verified disposable MySQL instance |
| `npm run test:functional` | Real HTTP functional/role/data audit on the same guarded disposable instance |
| `npm run build` | Compile `dist` |
| `npm start` | Start the compiled API |
| `npm run migrate` / `npm run migrate:status` | Read-only migration status; no metadata tables are created |
| `npm run migrate:up` | Apply pending migrations to the configured database |
| `npm run admin:create` | Insert a new administrator after migrations are complete |

The integration suite requires `MEKTEB_TEST_MYSQL_PORT` between 10000 and 65535 and `MEKTEB_TEST_MYSQL_DIRECTORY` pointing to an isolated instance directory. That directory must contain `test-instance-marker` with exactly `isolated-mekteb-test`, and its `data` subdirectory must match the server's reported datadir. The suite connects only to loopback, verifies both port and datadir, creates a random test database, and removes that database afterward. Provision a disposable instance separately; these variables must not identify a shared or production instance. Integration tests do not read `.env` files.

`npm run test:functional` additionally writes `../mekteb-e-dnevnik/docs/qa-http-results.json` with scenario outcomes and requested routes; it contains no credentials. `node --import tsx scripts/qa-preview.cjs` starts a synthetic UI fixture on port 5507 using the same strict instance checks. Start Vite separately with its API URL pointing to `http://127.0.0.1:5507/backend/api`. Send `q` on standard input to close it and remove its fixture database. `fail-attendance`, `fail-news` and `fail-upload` each simulate one HTTP 503 for UI recovery checks. This preview does not run the push sender or contact phone providers.

`node --import tsx scripts/qa-backup.cjs` performs a database-only backup/restore drill on Windows with MySQL 8.0 binaries in their standard installation folder. It creates its own guarded fixture, signs in and rotates a session, dumps that fixture, restores into a second random database, compares every row of every table, and removes both databases. It writes `../mekteb-e-dnevnik/docs/qa-backup-results.json`. The SQL dump stays inside the disposable instance directory for cleanup. Real operational backups must also include uploaded images and protected configuration; a verified production backup and restore procedure still needs to be established on the hosting platform.

`DATE` values are returned as `YYYY-MM-DD` strings (`dateStrings: ['DATE']`) so birthdays and attendance never shift through timezone conversion. Timestamp fields retain their existing handling. Attendance upserts are atomic, bulk writes roll back together, unrecorded students are counted separately, and statistics coerce SQL decimal/sum results to numbers. News uploads validate raster signatures and total image count in a transaction; failed uploads and deleted articles clean up their image files.

Illustrated PDFs: [efendija](../mekteb-e-dnevnik/output/pdf/Uputstvo-za-efendiju.pdf) and [roditelji](../mekteb-e-dnevnik/output/pdf/Kratko-uputstvo-za-roditelje.pdf).

Baseline creation, repeat migration runs, explicit schema adoption, checksum mismatch detection and partial-DDL recovery have been exercised on an isolated MySQL 8.0.43 instance. This does not validate the existing hosting database or proxy configuration.

## Database migrations

`000_create_core_tables.sql` creates `users`, `students`, `attendance`, `news` and `news_images`. It includes unique username/email constraints and unique attendance `(student_id, date)`. Existing migrations 001–004 remain unchanged. Migration 005 adds `auth_sessions` and `auth_refresh_history`. Migration 006 adds message receipts, soft deletion, conversation indexes, push subscriptions and the durable push delivery queue. The application does not run migrations automatically at startup.

The runner uses deterministic filename ordering, canonical SHA-256 file checksums and a database-specific MySQL advisory lock. MySQL DDL commits implicitly: each attempt and the number of completed statements are recorded, and failed or interrupted attempts block further migrations. A recorded count is diagnostic; after a connection loss, inspect the schema because the last statement may have committed before progress could be recorded.

### Existing installation

Take and verify a backup, inspect the target schema, and compare the original migration files with trusted deployment sources. Then:

1. Run `npm run migrate:status` to inspect pending files, checksum issues and unfinished attempts. An issue produces a nonzero exit code without changing the database.
2. If the old migration ledger contains prefix checksums, review the complete files before running `npm run migrate -- adopt-legacy-checksums --confirm-files-reviewed`. The old checksum covered only a file prefix and cannot prove that its contents were unchanged.
3. Run `npm run migrate -- adopt-baseline --confirm-schema-reviewed`. This verifies core columns, compatible types/nullability, primary and unique keys, foreign keys and InnoDB tables before recording migration 000. It does not create, repair, delete or backfill application data. Differences such as duplicate attendance or missing unique constraints require a separately reviewed correction; adoption refuses an incompatible schema.
4. Recheck status, then run `npm run migrate:up` to apply pending migrations, including 005 and 006.

An existing schema is never silently accepted with `CREATE TABLE IF NOT EXISTS`. Historical migrations already applied to a database must not be edited to make a checksum warning disappear.

### Failure recovery

Automatic rollback is disabled, including the legacy `migrate:rollback` command: a transaction cannot undo already committed MySQL DDL. Restore a verified backup or reconcile the exact schema manually, then use one of these explicit acknowledgements:

```text
npm run migrate -- resolve <filename> --applied --confirm-schema-reviewed
npm run migrate -- resolve <filename> --retry --confirm-schema-restored
```

Use `--applied` only after verifying every intended change is present. Use `--retry` only after restoring the schema/data to the state before that migration. The runner does not perform that restoration or blindly resume at a statement counter. Migration 000 additionally undergoes schema verification when resolved as applied. Changed migration files and unresolved attempts remain blockers. Run status before continuing.

## Administrator bootstrap

Set these variables in the process environment before `npm run admin:create`:

- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_FIRST_NAME`
- `BOOTSTRAP_ADMIN_LAST_NAME`

All five are required; there are no default credentials. The password must contain at least 12 characters and at most 72 UTF-8 bytes. The script hashes it with bcrypt cost 12 and inserts a new account with role `admin`. An existing username or email causes failure; no existing user is promoted or changed. The migration status must be clean with no pending files. Do not pass passwords as command-line arguments or commit bootstrap values to configuration files. Remove these variables from the calling shell after use.

## Persistent sessions and browser authentication

Access JWTs use HS256 with a required issuer, audience, expiry, session ID (`sid`) and unique token ID (`jti`). `JWT_EXPIRE` defaults to `15m` and cannot exceed 15 minutes. Every authenticated HTTP request checks both the active persisted session and the current account, so logout, session revocation, account deletion and role changes are enforced by the backend.

Refresh credentials are opaque random tokens, not JWTs. MySQL stores only a keyed SHA-256 digest using `JWT_REFRESH_SECRET`; the raw token is delivered in an HttpOnly cookie. Sessions have an absolute lifetime from login: `JWT_REFRESH_EXPIRE` defaults to `30d` (maximum `365d`), and refresh does not extend it. Refresh rotates the credential under a database row lock; reuse of a consumed token revokes that session. Rotation is deliberately strict: a lost response, concurrent uncoordinated refresh, or failure after a committed rotation can require signing in again.

Production cookies use `__Secure-mekteb_refresh`, `Secure`, `HttpOnly`, `SameSite=Lax` and path `/backend/api/auth`. Development uses `mekteb_refresh` without `Secure`. Login, registration and refresh return a safe user DTO, `accessToken` and `sessionId`; they never return the refresh credential in JSON. The frontend stores access tokens in memory and restores login through the refresh cookie. Previously stored tokens and the former stateless refresh JWTs are incompatible; users must sign in again after this upgrade.

Deploy the frontend and API over HTTPS on the same site (the same host or subdomains of the same registrable domain). `SameSite=Lax` does not support an unrelated cross-site frontend/API arrangement. Credentialed requests must use the exact allowed frontend Origin. Every auth mutation, including login, registration, refresh, logout and session deletion, requires `Origin` matching `FRONTEND_URL` and `X-CSRF-Protection: 1`. API clients must also send these headers; refresh reads only the cookie, not a JSON token.

| Endpoint under `/backend/api/auth` | Behavior |
|---|---|
| `POST /login`, `POST /register` | Create a persisted session and set its cookie |
| `POST /refresh` | Rotate the cookie credential and return a new access token |
| `POST /logout` | Revoke the current cookie session and clear its cookie |
| `POST /logout-all` | Revoke all sessions belonging to the authenticated account |
| `GET /sessions` | List that account's active sessions and identify the current one |
| `DELETE /sessions/:id` | Revoke an owned session; another user's session is not accessible |

Logout-all, session listing and deletion require a bearer access token. Revocation also disconnects matching live notification sockets. The WebSocket upgrade validates Origin, access-token expiry and the persisted session; delivery rechecks session activity, and expired connections are closed. Shutdown closes upgraded sockets before the HTTP server. Confirm reconnect behavior and WebSocket forwarding on the actual hosting proxy. WebSocket authentication uses an initial authenticate frame; bearer tokens are never placed in its URL.

## Resource access policy

| Resource | Administrator | Teacher | Parent / legacy user |
|---|---|---|---|
| User list | Allowed | Denied | Denied |
| User profile | Own; may edit another user's names | Own | Own |
| Student collection and management | Allowed | Allowed | Denied; use `/parent/students` |
| Attendance administration | Allowed | Denied, matching the current frontend | Denied |
| Parent attendance | Connected child only | Denied | Connected child only |
| Comment reads | All students | All students | Connected child only |
| Comment edits/deletion | Moderation allowed | Own messages | Own messages while still connected |
| Notification inbox | Own | Own | Own |

User responses use explicit field allowlists. Parent responses omit invitation keys; staff student responses retain them for the existing invitation UI. Parent comment queries require an authorized `studentId`; reply dates must match the original message. Invalid input returns 400, forbidden resource actions return 403, and unavailable authentication storage fails closed with 503.

Login, registration, refresh and invitation attempts have in-process rate limits. Multiple server processes require a shared limiter store. Live notification delivery also currently uses process-local connections; cross-process broadcasts need shared infrastructure. Helmet headers and an exact origin allowlist are applied in `createApp()`.

## Deployment and remaining work

Run type checks, regression tests, the isolated integration suite and builds before packaging. Both repositories currently track build output, so rebuild it from the reviewed sources. Keep private configuration and uploads outside paths that deployment synchronization may delete.

The release includes compiled production CLIs: `npm run migrate:production -- status`, `npm run admin:production`, `npm run check:production` and `npm run push:work`. They work with `npm ci --omit=dev` and do not need `tsx` or source files. Development CLI commands still use `tsx`. Restart the API after the reviewed migrations through 006 and deploy the matching frontend together; old clients and tokens cannot use the new cookie/session contract. Check health, login/refresh/logout and WebSocket behavior on the target host.

The replacement `.cpanel.yml` stages a candidate only; it never migrates or activates production. Use the shared release manifest and the deployment runbook for backup, rehearsal, installation, activation and rollback. The hosting clone and production migration are verified; the active release, cron and remaining phone test are recorded in the runbook.

Remaining operational and product work:

- Rotate historical DB/JWT secrets on the hosting provider. Removing environment files from Git tracking does not revoke old values or remove them from Git history. Changing the refresh-hash pepper invalidates existing refresh credentials; revoke sessions and plan a fresh sign-in when rotating compromised credentials.
- Verify backups, restoration and an application/schema recovery procedure against the actual installation. Existing schema adoption may require a reviewed compatibility migration.
- Replace short permanent parent keys with longer, expiring and revocable invitations. Existing keys are preserved; new keys use cryptographic randomness and connection attempts are throttled.
- Validate Web Push delivery on real Android and iPhone devices against the production HTTPS origin.
- Define session/history cleanup and audit retention, and validate proxy forwarding, cookie behavior and reconnects on the real hosting environment.

## Chat and notification delivery

`/messages` is the shared conversation workspace for administrators, teachers and parents. Each student has a conversation containing the existing daily comments and replies. All staff currently have access to all students, matching the existing authorization model. Parents and legacy parent users can start conversations only for currently connected children. Messages remain tied to their original calendar date; replies use the target message's date. `/comments` retains its staff-only original-note policy for existing attendance screens.

The inbox supports search, server-filtered unread conversations and pages of 50 students. Message history uses an ID cursor with pages up to100, rather than loading every historical message. The UI retains separate in-memory drafts for open conversations and clears them at a session boundary. A draft is not persisted across a browser reload. It shows pending or unconfirmed delivery with an explicit retry; it does not invent online or recipient-read indicators.

Every new message, recipient inbox entry and push job commits in one InnoDB transaction. `clientMessageId` is a UUID unique per author. The same receipt and request returns the original message, including after an edit; using it for different content returns409. The new chat endpoint requires the receipt; the updated legacy comments client also sends one. Soft deletion removes message text while preserving replies. Notification reads and push delivery recheck current child access, and deleted messages are excluded from unread notifications.

Relevant authenticated endpoints:

- `GET /backend/api/chat/conversations?search=&page=1&unreadOnly=true`
- `GET /backend/api/chat/conversations/:studentId`
- `GET /backend/api/chat/:studentId/messages?before=<id>&date=YYYY-MM-DD&limit=50`
- `POST /backend/api/chat/:studentId/messages` with `{ content, date, clientMessageId, parentCommentId? }`
- `PATCH /backend/api/chat/:studentId/read` with `{ throughId }` marks only the visible message range.
- `GET /backend/api/notifications/:id` resolves an owned notification for push deep links.
- `GET /backend/api/push/config`, `POST /backend/api/push/subscription`, `DELETE /backend/api/push/subscription`

Message creation is limited to40/minute per account; push registration is limited to10/minute per account. These are process-local limits. Open conversations refresh after live events and fall back to polling after disconnect. Multiple application processes still need shared live-event distribution; the MySQL push queue itself supports concurrent workers with SKIP LOCKED and durable leases.

## Enable phone notifications

1. Apply migration006 before deploying the matching backend and frontend. The production artifact must include `web-push` from the updated lockfile.
2. Run `npm run push:keys` in a controlled local environment. It exclusively creates the ignored `.env.web-push.local` and never overwrites an existing pair or prints the private key. Store its three `WEB_PUSH_*` values in the server's private configuration. Keep the pair stable across deploys. The subject is an HTTPS contact URL or mailto address; change the supplied project URL if appropriate.
3. Configure `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` together, then restart the backend. Missing all three leaves push disabled; partial or invalid configuration prevents startup. The backend starts its queue worker in the same long-running Node process. No separate paid provider account is needed for standard VAPID delivery.
4. Serve the frontend and `/sw.js` through HTTPS (loopback works for development). Serve `/sw.js` without a long cache lifetime and with a JavaScript content type. The manifest and icons must remain publicly accessible. The worker handles push and navigation only and never caches private API responses.
5. In Profile or Messages, choose Enable notifications on each device and approve the browser permission. On iPhone/iPad, add the web app to the Home Screen and open that installed app before enabling notifications. See [Apple's Web Push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

A subscription is bound to the authenticated device session. Refresh retains the binding; logout, expiry and session revocation stop new delivery. Another login on the same browser rebinds the endpoint, and old queued jobs cannot follow it to the new account. The service worker also stores a token-free binding in IndexedDB so late notifications from a previous account are discarded. Logging out closes displayed notifications on that browser.

The worker sends an encrypted generic notification, without child names or message content. Clicking it opens an owned notification through the normal authenticated app. It rechecks unread state, message deletion, session validity, role/child access and the subscription binding immediately before delivery. Push destinations are restricted to exact known service hosts (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`) to prevent SSRF. A deployment can supply a reviewed comma-separated `WEB_PUSH_ALLOWED_HOSTS` list for another provider; never add arbitrary user-controlled hosts.

Jobs retry network failures,429 and5xx with exponential delays, up to8 attempts and24h of queue age. Provider404/410 removes the expired subscription. A worker crash leaves a lease reclaimed after5minutes. A successful provider response means provider acceptance, not guaranteed device display. Delivery after acceptance can be delayed by the OS, connectivity or permission settings; a force-stopped browser may not deliver. Provider response loss can cause a retry, so the notification uses a stable tag/topic to coalesce duplicates. Define cleanup/retention for completed jobs and expired subscriptions before prolonged production operation.

The isolated MySQL integration suite tests transactions and rollback, simultaneous receipt retries, cursor history, inbox ownership, read markers, worker leases/concurrent claims, retries, expiry410 cleanup, session revocation and soft deletion. Push transport is replaced by a test sender; it does not send notifications to a real phone. Browser smoke checks use synthetic local accounts. Real-device delivery must be checked after HTTPS deployment.
