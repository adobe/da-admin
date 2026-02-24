# Debugging: Job Progress (Completed Count) Not Updating

When copying/moving folders, the frontend polls the job status API to show progress (e.g. "45 of 80 items"). If the completed count doesn't update, use this guide.

## Flow Overview

1. **Copy/Move API** → Returns 202 with `{ jobId, total }` for folders
2. **Queue consumer** → Processes each file, calls `incrementCompleted(env, jobId, count)` on the Durable Object
3. **Job status API** → `GET /job/{org}/{jobId}` returns `{ completed, total, state }` from the DO
4. **Frontend** → Polls every 1s, displays `completed of total`

## Debug Logs (Browser Console)

When pasting folders, open DevTools → Console. You should see:

```
[da-list pollAllJobs] start { count: 1, totalItems: 80, initialCompleted: 0 }
[da-list pollAllJobs] job status { jobId: "uuid", url: "...", completed: 0, total: 80, state: "running" }
[da-list pollAllJobs] display { displayCompleted: 0, totalItems: 80, initialCompleted: 0, asyncCompleted: 0, byJob: {...} }
```

Each poll cycle (~1s):
```
[da-list pollAllJobs] job status { jobId: "uuid", completed: 25, total: 80, state: "running" }
[da-list pollAllJobs] display { displayCompleted: 25, totalItems: 80, ... }
```

## What to Check

### 1. No `pollAllJobs` logs at all

**Cause**: All items returned 200 (sync) – no async jobs created.

- **COPY_QUEUE configured?** The copy/move handler only enqueues when `env.COPY_QUEUE` exists. Without it, folders copy synchronously (200) and never create jobs. Progress would show during the API phase only (sync completes), then "X of X" when done.
- Check `[da-list handleItemActionApi] response` in console – if all show `status: 200`, you have no queue and no polling.

### 2. `completed` stays at 0 in job status

**Cause**: Consumer isn't processing the queue, or `incrementCompleted` isn't being called.
- **Consumer running?** The queue consumer runs via `handleQueueBatch` (triggered by your queue binding). Check Workers logs for "Queue batch processing" or errors.
- **Queue delivery** – Verify queue messages are being delivered (Cloudflare dashboard → Queues).

### 3. Job status returns 404 or 403

- **404**: Job expired (TTL 24h) or DO not found. Check jobId matches what was returned in the 202 response.
- **403**: Caller email doesn't match `job.createdBy`. The request must include auth (cookies/IMS). Ensure you're logged in when pasting.

### 4. Job URL wrong

Frontend builds: `${DA_ORIGIN}/job/${org}/${jobId}`

- `org` = first path segment from `item.path` (e.g. `/adobe/site/folder` → org = `adobe`)
- If your paths use a different structure, org extraction may be wrong. Check the console log for the actual `url` being fetched.

### 5. `completed` updates in logs but UI doesn't

- Check `displayCompleted` in the console – if it increases, the display logic is fine; the issue may be `setStatus` / `requestUpdate` not triggering a re-render.
- Verify `this.setStatus()` is being called with the new values.

## Backend Verification

### Test job status directly

After starting a copy, get the jobId from the 202 response or the console. Then:

```bash
curl -b "your-cookies" "https://admin.da.live/job/{org}/{jobId}"
```

Expected: `{ "state": "running", "total": 80, "completed": 25, "failed": 0, "errors": [] }`

If `completed` increments over time, the backend is correct and the issue is frontend or polling.

### Check consumer logs

When the consumer runs, it should call `incrementCompleted` after each batch. Add temporary logging in `consumer.js`:

```js
if (successCount > 0) {
  console.log('[consumer] incrementCompleted', { jobId, successCount });
  await incrementCompleted(env, jobId, successCount);
}
```

## Poll interval

Default is 1000ms. For faster feedback, reduce `POLL_INTERVAL` in `pollAllJobs` (e.g. 500ms). Trade-off: more requests.
