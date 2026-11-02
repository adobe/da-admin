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

### Helix 6 migration (dual write)
Sites listed in the `HLX6_MIGRATION_SITES` env variable (see `wrangler.toml`) are being migrated to Helix 6. Every successful modification on those sites (source create/update/delete, folder creation, copy, move, version creation) is also propagated, in the background, to the Helix 6 source bus at `AEM_API` (`https://api.aem.live`) using the caller's IMS token. Failures are logged but do not affect the DA response.

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
backoff. `Retry-After` seconds/dates are honored only when they fit the budget;
otherwise bounded exponential backoff with jitter is used. Network errors and
5xx responses have uncertain mutation outcomes and are not automatically
replayed, especially for VERSION. Permanent 4xx responses are not retried.
`request_retry_scheduled` and `request_exhausted` events record attempts and
decisions. Events include actor emails when available, never bearer tokens.

This is best-effort delivery, not a durable queue or an ordering guarantee.
Failure logs retain operation/path/revision and payload-hash evidence for later
investigation; they cannot restore overwritten or deleted bytes without
available source history. Folder events are not an authoritative per-file audit.

Source uploads use the target source API's raw POST mechanism. A target HTTP 413
is a permanent compatibility failure, not a reason to reject the successful DA
write. `propagation_unsupported` with `reason: "target_payload_too_large"` records
the exact bytes, MIME type, SHA-256, source revision/document ID when available,
and receiver error. The upload is not retried. There is no guessed local size
limit or automatic switch to the unrelated media API: use a verified
target-supported upload mechanism or reduce the payload, then reconcile.

Before enabling migration, the DA log pipeline must be verified to ingest these
worker console entries without sampling, retain them for at least 14 days (plus
analysis time), and preserve the structured event fields. Retention and ingestion
are managed outside this repository; this configuration does not establish them.
