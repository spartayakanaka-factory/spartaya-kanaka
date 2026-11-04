# Isolated Phase 2 development

This workspace now has a real, private local MariaDB 11.8.9 runtime and a filesystem-backed S3-compatible development service. Neither connects to Hostinger. Use the commands below from the application root. The wrapper finds the bundled Node runtime when Node is not on the shell PATH.

## Start the existing environment

```sh
scripts/local-phase2 db start
scripts/local-phase2 media start
scripts/local-phase2 dev
```

Open <http://localhost:3002/admin>. The synthetic local owner identity and its current random password are in `.local/phase2/owner.json`, readable only by the local user. They are development credentials, not factory or Hostinger credentials. Never copy this file to GitHub, a screenshot, or a deployment. The first login requires a password change. The browser acceptance runner updates this private file after its first password rotation.

Use `scripts/local-phase2 build` followed by `scripts/local-phase2 start` for the production server on the same port. Stop the other server first. The normal `next build --webpack` architecture and pinned dependencies are preserved.

## Recreate on this Mac without a system package manager

```sh
scripts/local-phase2 db setup
scripts/local-phase2 tools
scripts/local-phase2 db backup
scripts/local-phase2 init
scripts/local-phase2 media start
scripts/local-phase2 bootstrap
scripts/local-phase2 import --apply
```

`db setup` obtains checksum-verified official Homebrew ARM64 bottles for MariaDB 11.8 and its runtime libraries. It installs nothing globally, starts no system service, binds only `127.0.0.1:33077`, removes installer-created passwordless root identities, and generates private random credentials. A verified temporary symlink handles spaces in the workspace path; the data stays in `.local/phase2/data`. The app account has grants only on `sprtaya_phase2_local` and `sprtaya_phase2_test`.

`init` generates Prisma and runs the existing guarded migrations and role seed against these two databases only. It refuses remote hosts, different ports or database names. Repeating it performs no pending migrations. The original two migration SQL files and Hostinger protections remain unchanged.

`tools` obtains checksum-verified pnpm 11.24.0 and SeaweedFS 4.51. Existing application dependencies are required in `node_modules`; no application dependency upgrades are part of this work. The portable database installer currently targets macOS ARM64. On another OS, supply an equivalent isolated MariaDB environment and use the documented database guard rather than editing the allowlist.

## Tests and backup

```sh
scripts/local-phase2 validate
scripts/local-phase2 typecheck
scripts/local-phase2 lint
scripts/local-phase2 test
scripts/local-phase2 build
scripts/local-phase2 db backup
```

The test command opts into real database tests on **sprtaya_phase2_test**. Ordinary unit runs skip those suites. Framework request context is adapted in the server-action integration suite; Better Auth, Prisma, permissions, actions and transactions are real. The browser runner additionally exercises real HTTP, cookies, forms and object storage against the development database. It writes screenshots and a report under `.local/phase2/acceptance`.

Run `scripts/local-browser-acceptance.mjs` with the available Playwright package (or `PLAYWRIGHT_PACKAGE` pointing to it) and Chrome. It uses synthetic products/categories and real archived factory photography; test prices and quantities belong only to synthetic fixtures. It does not assign prices to imported products.

Backups contain database data and password hashes. They are private mode-600 files in `.local/phase2/backups` and must remain outside source control. Use `scripts/local-phase2 db backup --verify` while app writes are stopped to restore a snapshot into a newly created disposable verification database and compare every table's row count. The runner refuses to reuse an existing verification database. Do not restore a dump into either application database without first reviewing its contents and intended target. Keep a separate copy on trusted local backup storage for protection against laptop loss.

## Persistent development media

`media start` runs SeaweedFS on loopback only with all data under `.local/phase2/media`. The app gets scoped read/write credentials for two buckets: private originals and anonymous-read display images. Anonymous writes and original reads are denied. The admin origin is restricted to `http://localhost:3002`. No paid service or cloud account is created. `media stop` preserves objects; `media start` reuses them.

The two private environment files, all downloaded binaries, logs, credentials, databases and S3 data are ignored by Git, ESLint and TypeScript. Next.js output-file tracing explicitly excludes this private state and `.env` files. Keep these exclusions when packaging the app.

The 1,752 imported legacy image records continue using the preserved original archive. A supported externally persistent service and an approved verified media migration remain prerequisites for any hosted release that does not retain that archive. Local disk persistence is not evidence of cloud durability or Hostinger support.

## Scope

The local catalog uses `CATALOG_SOURCE=mysql`. Imported products remain hidden drafts with no operational prices until a human reviews genuine prices, types, category visibility, copy and inventory. Publishing and unpublishing read from MariaDB immediately; checkout and customer accounts remain disabled. Hostinger operations, DNS, production databases, deployment and Phase 3 are outside this local procedure.
