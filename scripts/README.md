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

At the end, a **DRY RUN summary** shows what would have been done (snapshots to copy, audit.txt files and entries). Run **Analyse** first and compare: Analyse's "With content" total should match "Snapshots would copy", and "Empty" is the raw count before dedup (Migrate's "audit entries" will be lower after same-user + 30 min dedup).

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

## Version storage modes

Two env vars control behaviour per-org:

- **`VERSIONS_AUDIT_FILE_ORGS`** — comma-separated; orgs in this list use the new `audit.txt`-based structure.
- **`VERSIONS_AUDIT_SKIP_LEGACY_ORGS`** — comma-separated; orgs in this list stop reading the legacy prefix on list (set only after migration is complete).

### Mode A — ORG is NOT in `VERSIONS_AUDIT_FILE_ORGS` (legacy / default)

This is the pre-PR baseline. No behaviour changes from main.

**Write (every save)**
- Snapshot written: only for explicitly labelled versions (`POST /versionsource`) or Restore Point.
  - Written to: `{org}/.da-versions/{fileId}/{versionId}.{ext}` (with content body)
- Audit marker written: empty object at same path, for every versionable save (html/json), so listing can discover it.
  - Written to: `{org}/.da-versions/{fileId}/{versionId}.{ext}` (empty body)
  - **Not written when a snapshot was just written** — the snapshot itself is the marker.

**List versions**
- Lists objects under prefix `{org}/.da-versions/{fileId}/`, HEADs each for metadata.
- Only entries with `contentLength > 0` produce a versioned URL; the rest appear as plain edit entries.
- Capped at 500 entries.

**Read a version**
- Request URL: `GET /versionsource/{org}/{fileId}/{versionId}.{ext}`
- S3 key resolved: `{org}/.da-versions/{fileId}/{versionId}.{ext}`

---

### Mode B — ORG in `VERSIONS_AUDIT_FILE_ORGS`, NOT in `VERSIONS_AUDIT_SKIP_LEGACY_ORGS`

Migration in progress: new writes go to the new structure; reads merge both sources.

**Write (every save)**
- Snapshot written: only for explicitly labelled versions or Restore Point.
  - S3 key: `{org}/{repo}/.da-versions/{fileId}/{versionId}.{ext}` (with content body)
- Audit entry appended to `{org}/{repo}/.da-versions/{fileId}/audit.txt` on every versionable save.
  - Format (tab-delimited): `timestamp \t users \t path \t versionLabel \t versionId`
  - `path` stored without repo prefix (e.g. `/page.html`, not `repo/page.html`)
  - Same-user edits within 30 minutes collapse into one updated line (edit, no label).
  - Version entries (labelled / Restore Point) always append and never collapse.
  - When `audit.txt` reaches 500 entries: archived to `audit-{lastTimestamp}.txt`, fresh `audit.txt` started.
  - Concurrent write safety: GET + If-Match PUT; one automatic retry on 412.

**List versions**
- Reads all `audit*.txt` files (current + archives) in parallel, flattens, sorts descending by timestamp, caps at 500.
- **Also** reads legacy path (`{org}/.da-versions/{fileId}/`).
- Merges both: audit entries take priority; legacy entries with duplicate timestamps are dropped.

**Read a version**
- Request URL: `GET /versionsource/{org}/{repo}/{fileId}/{versionId}.{ext}`
- Tries new S3 key first: `{org}/{repo}/.da-versions/{fileId}/{versionId}.{ext}`
- Falls back to legacy S3 key: `{org}/.da-versions/{fileId}/{versionId}.{ext}`

---

### Mode C — ORG in `VERSIONS_AUDIT_FILE_ORGS` AND in `VERSIONS_AUDIT_SKIP_LEGACY_ORGS`

Migration complete. Legacy prefix is skipped on list.

**Write** — identical to Mode B.

**List versions**
- Reads only `audit*.txt` files under `{org}/{repo}/.da-versions/{fileId}/`; no legacy list.
- Sorts descending by timestamp; caps at 500.

**Read a version**
- Request URL: `GET /versionsource/{org}/{repo}/{fileId}/{versionId}.{ext}`
- Tries new S3 key first: `{org}/{repo}/.da-versions/{fileId}/{versionId}.{ext}`
- Falls back to legacy S3 key if new returns 404 (pre-migration snapshots remain accessible).
  - `VERSIONS_AUDIT_SKIP_LEGACY_ORGS` suppresses the *list* only; individual fetches still fall back.

---

### S3 key reference

| Purpose | Path |
|---|---|
| Live document | `{org}/{repo}/{path}.{ext}` |
| Snapshot (new) | `{org}/{repo}/.da-versions/{fileId}/{versionId}.{ext}` |
| Snapshot (legacy) | `{org}/.da-versions/{fileId}/{versionId}.{ext}` |
| Audit log (active) | `{org}/{repo}/.da-versions/{fileId}/audit.txt` |
| Audit log (archive) | `{org}/{repo}/.da-versions/{fileId}/audit-{timestamp}.txt` |

## Operational ordering

**Run migration before activating `VERSIONS_AUDIT_SKIP_LEGACY_ORGS` for an org.** Once that flag is set, the worker's list logic stops reading the legacy prefix (`org/.da-versions/`). Any audit entries written to the legacy path after that point will be invisible to the worker — and the migration script would also miss them if run afterwards.

Safe order:
1. Run `version-migrate-run.js` for the org.
2. Verify with `version-migrate-validate.js`.
3. Add the org to `VERSIONS_AUDIT_FILE_ORGS` → activates Mode B (dual-read + new writes).
4. Verify version list correctness in the UI.
5. Add the org to `VERSIONS_AUDIT_SKIP_LEGACY_ORGS` → activates Mode C (audit-only reads).
6. Optionally delete legacy objects under `{org}/.da-versions/` to reclaim storage.

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
