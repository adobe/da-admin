# Document Authoring Admin

## Introduction
Document Authoring Admin is the API used to store and retrieve files and details from the Document Authoring content repository.

You can read the official API docs here: https://docs.da.live

## Info
[![codecov](https://codecov.io/github/adobe/da-admin/graph/badge.svg?token=RP74sW9MlC)](https://codecov.io/github/adobe/da-admin)

## Getting started

### Requirements
1. Node 20+

### Local development

#### 1. Clone
```bash
git clone git@github.com:adobe/da-admin
```

#### 2. Install
In a terminal, run `npm install` this repo's folder.

#### 3. Login
Use `npx wrangler login`. Walk through the steps in browser.

#### 4. Setup an auth KV
KV is used for high-performance R/W operations. This value is stored locally.
```bash
npx wrangler kv:key put orgs '[{"name":"aemsites","created":"2023-10-31T17:43:13.390Z"}]' --binding=DA_AUTH --local
```

#### 5. Start the local server
At the root of the project folder, run `npm run dev`.

#### 6. Validate
Browse to `http://localhost:8787/list` to ensure you see the expected buckets.

### Additional details

1. You can make your own buckets tied to your own Cloudflare account or you can request a `.dev.vars` file.
2. Cloudflare KV, which is used for org properties and session login info is locally stored when developing locally. You will need to make your own local KVs to test against.

### Helix 6 request handling

Sites listed in `HLX6_MIGRATED_SITES`, an array of `org/site` entries (or a
JSON-encoded array or comma/newline-separated string), use a synchronous
compatibility bridge to `AEM_API` (`https://api.aem.live` by default). The site
check is local; no network probe is made.

The bridge supports:

- Source GET/HEAD, streaming bodies and returning ETag/Last-Modified. Matching
  `If-None-Match` returns 304; `If-Match` read failures return 412.
- Site/folder GET listings, converted to DA item fields and hidden-file
  filtering. HLX6 listings are unpaginated; a legacy continuation token on a
  migrated site's listing is rejected.
- Org GET listings, merging legacy DA sites with the org's HLX6 sites
  (`GET /{org}/source/` with the caller's token), filtered by DA ACLs. If the
  HLX6 listing fails (outage, missing HLX6 role), the DA listing is still
  returned. Only the first legacy page adds HLX6 sites; subsequent pages
  preserve the DA continuation token without repeating them.
- Site editor-config GET and multipart PUT/POST (`config` field), converting
  between DA sheet wrappers and `config/editor/da.json` row arrays. The whole
  AEM site configuration is never replaced.
- Source multipart PUT/POST (`data` field) and raw uploads, converted to HLX6
  POST, including its image-import behavior and validation. String `data`
  fields are accepted for `.html`, `.json` and `.svg` only (415 otherwise).
  Successful saves return DA's source/edit/preview/live URL envelope and the
  upstream ETag. Bodyless folder writes become trailing-slash POSTs.
  Upstream redirects are rejected with 502.

All requests retain existing DA ACL checks and require the caller's Bearer
token and the corresponding HLX6 permissions. There is no service-token
elevation, mutation retry, or fallback to writable legacy storage. Responses
are private/no-store. Legacy UUID and permission-hint headers are not invented:
`x-da-id`, `x-da-actions`, and `x-da-child-actions` are unavailable on bridged
site responses. DA ACLs and HLX6 roles must be configured separately.

Version/history APIs, copy/move/delete, dedicated media uploads, GUID-specified
uploads, collaborative writes, and extensionless file uploads remain
unsupported and return 410. Raw `/.versions` and `/.history` access through
source/list is blocked. Multiple-author token headers are rejected rather
than silently selecting an author. HTML transformations, validation, request
limits, and empty-document restore points are not identical to DA.

Org config, authentication, logout, and CORS preflight remain available locally.
The bridge does not change the HLX6 editor's org-config inheritance behavior.
Sites configured for dual write in `HLX6_DUAL_WRITES` retain normal DA behavior
during migration, even if they also appear in `HLX6_MIGRATED_SITES`.

The companion da-content change routes migrated sites through its `daadmin`
binding before direct-R2 allowlists and asset opt-outs. Configure the same
migration variables on both workers, and deploy the da-admin bridge first.
Content path/cookie handling remains on the legacy host; no browser redirect
or Library URL rewrite is required for supported source reads.

### Helix 6 migration (dual write)
Sites listed in the `HLX6_DUAL_WRITES` env variable are being migrated to Helix 6. Every successful modification on those sites (source create/update/delete, folder creation, copy, move, version creation) is also propagated, in the background, to the Helix 6 source bus at `AEM_API` (`https://api.aem.live`) using the caller's IMS token. Failures are logged but do not affect the DA response.

Manage both `HLX6_MIGRATED_SITES` and `HLX6_DUAL_WRITES` in the Cloudflare dashboard.
Neither is declared in any `wrangler.toml` vars block: `keep_vars = true`
preserves dashboard values, but an explicit declaration would override them on
deployment. Local development can set these variables in `.dev.vars` as needed.
Rename the previous `HLX6_MIGRATION_SITES` dashboard variable to `HLX6_DUAL_WRITES`
when deploying this change. Moving a site out of dual write requires adding it
to `HLX6_MIGRATED_SITES` and removing its source entry from `HLX6_DUAL_WRITES`.

Entries are either:
- `org/site`: the same org/site on Helix 6
- `org/site -> org2/site2`: a different Helix 6 org/site (e.g. for testing)

#### Migration analysis after deployment

`[hlx6:event]` console entries contain JSON with `component: "hlx6-migration"`
and `schemaVersion: 1`. Each observed mutation of a configured migration site
has a unique `operationId`, DA status/path/revision (when available), source and
destination mappings, incoming request/ray ID, environment, and deployment version.
Credentials and uploaded document bytes are not logged.
Raw-body uploads record their byte length and SHA-256 digest, so distinct payloads
can be identified without storing document contents in logs.

- `operation_observed` must be followed by `operation_skipped` (with a reason) or
  `operation_started` and `operation_completed` (`succeeded` or `failed`).
- Outbound steps have distinct `requestId` values, also sent as `x-request-id`.
  `request_started` is followed by `request_completed` or `request_failed`.
  Responses include status, timing, error/location headers, receiver IDs, and
  an 8192-character body preview with an explicit truncation flag. Existing
  debug logs retain the full response body.
- HTTP and network errors fail the operation, not the DA response. A body-read
  error is recorded separately; a 2xx response still means the remote mutation
  succeeded, even if its response body could not be read.
- DELETE 404 responses with the exact `x-error` value `[admin] Not found` or
  `[AWS] Not Found` and a readable response body are idempotent success, including
  the delete step of a MOVE. Their `request_completed` event retains HTTP
  `status: 404` and `ok: false`, with `outcome: "already_absent"`; the operation
  completes as `succeeded`. Count these separately from actual deletions.
  Other 404s (including version-before-trash failures) remain failures.
- Missing terminal events indicate interrupted work or missing logs, **not success**.
  A partial DA response (`daPartial`) and continuation skips must be reviewed;
  whole-folder propagation does not prove per-file parity. Cross-site folder
  operations and dedicated media uploads are explicitly reported as unsupported.

For a two-week review, count observed operations by deployment, operation, and
mapped site; reconcile every operation and request with its terminal event;
inspect failures, skips, partials, and body-read errors. A successful HTTP
response proves API acceptance, not byte-for-byte parity or correct write ordering.
Outbound requests retry explicit HTTP 429 rejections at most three times total
(including the initial attempt), using the original caller's token. All steps
of an operation share a 20-second deadline, including response-body reads and
backoff. Each retry waits for the greater of the server's `Retry-After`
seconds/date delay and exponential backoff with jitter (250-499 ms before the
second attempt, 500-999 ms before the third). Zero or elapsed server delays
cannot bypass backoff; missing or invalid headers use backoff alone. If the
delay would reach or exceed the remaining budget, no retry is attempted.
Network errors and
5xx responses have uncertain mutation outcomes and are not automatically
replayed, especially for VERSION. Permanent 4xx responses are not retried.
`request_retry_scheduled` and `request_exhausted` events record attempts and
decisions. Events include actor emails when available, never bearer tokens.

This is best-effort delivery, not a durable queue or an ordering guarantee.
Failure logs retain operation/path/revision and payload-hash evidence for later
investigation; they cannot restore overwritten or deleted bytes without
available source history. Folder events are not an authoritative per-file audit.

For read-only analysis of a JSON-array or NDJSON export of worker rows (`logs`
arrays) or structured events:

```sh
node scripts/hlx6-report.js export.json --org adobecom --site da-events \
  --start 2026-10-19T08:45:07Z --end 2026-11-02T08:45:07Z
```

The JSON report deduplicates operations/requests, groups outcomes and HTTP
statuses, and includes actor/revision/hash evidence and step checkpoints for
failed or incomplete operations. It excludes both E2E folders under
`drafts/esp-dev` and `drafts/esp-stage`, considering COPY/MOVE source and
destination as well as the request key. It never writes content or replays work.
Exit codes: 0 = no failed/incomplete operations in the supplied export,
2 = investigation required, 1 = invalid input/read failure. Skips are reported
separately and must also be reviewed. Export retention/completeness and current
content parity are not verified. Schedule exports and this command in the
existing operations system and route nonzero exit codes to its alerting;
no scheduler or alert destination is provisioned by this tool.

Source uploads use the target source API's raw POST mechanism. A target HTTP 413
is a permanent compatibility failure, not a reason to reject the successful DA
write. `propagation_unsupported` with `reason: "target_payload_too_large"` records
the exact bytes, MIME type, SHA-256, source revision/document ID when available,
and receiver error. The upload is not retried. There is no guessed local size
limit or automatic switch to the unrelated media API: use a verified
target-supported upload mechanism or reduce the payload, then reconcile.

COPY/MOVE record `operation_checkpoint` events for completed copy and started/
completed delete steps. A recognized remote source-not-found during file copy
falls back to uploading the current committed DA destination, recording its
ETag and document ID when available. It does not reconstruct an older revision.
Missing remote folders require manual reconciliation; the source is not deleted.
Partial/continuation DA MOVEs are explicitly skipped rather than deleting an
entire target source after only partial DA success. Checkpoint logs support
manual reconstruction, not automatic resumption or exactly-once execution.

VERSION captures the immutable DA snapshot key in its operation events. It
compares the current target content with that snapshot before requesting a
version, then reads the returned same-target version URL to verify its content.
Missing snapshots or mismatched content fail explicitly; no attempt is made to
overwrite newer target content to force a historical version. Target HTML
transformations can cause a conservative mismatch requiring manual inspection.
The verified target GET must return a single strong ETag. VERSION sends it as
`If-Match` so the target atomically snapshots only that revision. Missing, weak
or malformed ETags fail explicitly without requesting a version. A concurrent
target edit produces HTTP 412 and `version_precondition_failed`; DA does not
retry against the newer revision or overwrite it. Reconcile before retrying.
This requires target API support for conditional VERSION creation
(adobe/helix-api-service#537). Post-verification remains a defense against
unexpected target behavior, not a global history-ordering guarantee.
Never blindly replay an accepted version creation whose verification failed
or a request with an unknown remote outcome.
GET response document bodies used for verification are omitted from both
structured and debug logs.

Before enabling migration, the DA log pipeline must be verified to ingest these
worker console entries without sampling, retain them for at least 14 days (plus
analysis time), and preserve the structured event fields. Retention and ingestion
are managed outside this repository; this configuration does not establish them.
