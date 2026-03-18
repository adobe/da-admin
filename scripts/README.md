# Version storage migration scripts

These scripts migrate version data from the legacy layout (`org/.da-versions/fileId/`) to the new layout (`org/repo/.da-versions/fileId/` plus `audit.txt`).

## Prerequisites

- Node.js (ESM)
- Environment: set `AEM_BUCKET_NAME`, `ORG`, and S3 credentials. Easiest: copy `.dev.vars` to `.env` or export vars, and ensure `scripts/load-env.js` is imported so `.dev.vars` / `.env` are loaded.

## Scripts

**You can run Migrate directly** — it discovers file IDs by listing `org/.da-versions/`. **Analyse is optional**: use it to inspect scope (object counts, empty vs with content) before migrating.

### 1. Analyse (`version-migrate-analyse.js`) — optional

Lists all version folders under `org/.da-versions/`, counts objects (using list only, no HEAD), and prints a **summary** of what Migrate will do: total objects, empty (→ audit entries), with content (→ snapshots to copy). Processes all file IDs in parallel (faster). Not required before Migrate.

```bash
node scripts/version-migrate-analyse.js myorg
# Per-file breakdown:
node scripts/version-migrate-analyse.js myorg --verbose
```

### 2. Migrate (`version-migrate-run.js`)

Runs standalone (no need to run Analyse first). Processes file IDs in parallel. For each file ID under `org/.da-versions/`:

- Copies snapshot objects (contentLength > 0) to `org/repo/.da-versions/fileId/versionId.ext` (repo from object metadata `path`).
- Builds `audit.txt`: deduplicates legacy empty-version metadata (same user + 30 min window), **merges with any existing `audit.txt` already in the new path** (hybrid case: project not yet migrated but new PUTs have been writing audit there), then writes the combined, deduplicated result.

**Dry run (no writes):**

```bash
DRY_RUN=1 ORG=myorg AEM_BUCKET_NAME=mybucket node scripts/version-migrate-run.js
```

At the end, a **DRY RUN summary** shows what would have been done (snapshots to copy, audit.txt files and entries). Run **Analyse** first and compare: Analyse’s “With content” total should match “Snapshots would copy”, and “Empty” is the raw count before dedup (Migrate’s “audit entries” will be lower after same-user + 30 min dedup).

**Execute:**

```bash
ORG=myorg AEM_BUCKET_NAME=mybucket node scripts/version-migrate-run.js
```

### 3. Validate (`version-migrate-validate.js`)

Compares object counts for a single document: legacy prefix vs new prefix.

**Progressive rollout (list API):** Without `VERSIONS_AUDIT_FILE_ORGS`, the list uses **only** `org/.da-versions/{fileId}/` (no `repo/.da-versions`, no `audit.txt`). With the org listed, the list uses `audit.txt` (+ legacy merge unless `VERSIONS_AUDIT_SKIP_LEGACY_ORGS`).

```bash
ORG=myorg node scripts/version-migrate-validate.js myorg repo/path/to/file.html
```

## Env vars

| Variable            | Description                    |
|---------------------|--------------------------------|
| `AEM_BUCKET_NAME`   | R2/S3 bucket name              |
| `ORG`               | Org slug (e.g. `kptdobe`)      |
| `S3_ACCESS_KEY_ID`  | S3/R2 access key               |
| `S3_SECRET_ACCESS_KEY` | S3/R2 secret key           |
| `S3_DEF_URL`        | S3/R2 endpoint URL             |
| `DRY_RUN`           | Set to `1` to skip writes (migrate script) |
| `MIGRATE_ANALYSE_CONCURRENCY` | Analyse: parallel file IDs (default 25) |
| `MIGRATE_RUN_CONCURRENCY`     | Migrate: parallel file IDs (default 15)  |
| `VERSIONS_AUDIT_FILE_ORGS`         | List from `audit.txt` for these orgs; merge legacy prefix unless skip list applies |
| `VERSIONS_AUDIT_SKIP_LEGACY_ORGS` | With audit-file orgs: do not read `org/.da-versions` (after migration) |

Load from `.dev.vars` or `.env` by ensuring the script imports `./load-env.js` first (already done in each script). For the Worker, set vars in `.dev.vars` or wrangler `vars`.
