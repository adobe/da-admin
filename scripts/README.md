# Version storage migration scripts

These scripts migrate version data from the legacy layout (`org/.da-versions/fileId/`) to the new layout (`org/repo/.da-versions/fileId/` plus `audit.txt`).

## Prerequisites

- Node.js (ESM)
- Environment: set `AEM_BUCKET_NAME`, `ORG`, and S3 credentials. Easiest: copy `.dev.vars` to `.env` or export vars, and ensure `scripts/load-env.js` is imported so `.dev.vars` / `.env` are loaded.

## Scripts

### 1. Analyse (`version-migrate-analyse.js`)

Lists all version folders under `org/.da-versions/` and samples object counts (empty vs with content).

```bash
ORG=myorg AEM_BUCKET_NAME=mybucket node scripts/version-migrate-analyse.js
# or with .dev.vars present:
node scripts/version-migrate-analyse.js myorg
```

### 2. Migrate (`version-migrate-run.js`)

For each file ID under `org/.da-versions/`:

- Copies snapshot objects (contentLength > 0) to `org/repo/.da-versions/fileId/versionId.ext` (repo from object metadata `path`).
- Builds `audit.txt`: deduplicates legacy empty-version metadata (same user + 30 min window), **merges with any existing `audit.txt` already in the new path** (hybrid case: project not yet migrated but new PUTs have been writing audit there), then writes the combined, deduplicated result.

**Dry run (no writes):**

```bash
DRY_RUN=1 ORG=myorg AEM_BUCKET_NAME=mybucket node scripts/version-migrate-run.js
```

**Execute:**

```bash
ORG=myorg AEM_BUCKET_NAME=mybucket node scripts/version-migrate-run.js
```

### 3. Validate (`version-migrate-validate.js`)

Compares object counts for a single document: legacy prefix vs new prefix.

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

Load from `.dev.vars` or `.env` by ensuring the script imports `./load-env.js` first (already done in each script).
