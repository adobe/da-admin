/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/*
 * Propagation of DA modifications to the Helix 6 (hlx6) source bus for sites that are
 * being migrated. Sites are declared in the HLX6_MIGRATION_SITES env variable as a list of
 * `org/site` (same org/site on hlx6) or `org/site -> org2/site2` (different hlx6 target).
 *
 * Propagation is best effort: it runs after the DA operation succeeded, in the background
 * (ctx.waitUntil), and failures are only logged.
 */

export const DEFAULT_AEM_API = 'https://api.aem.live';

const SUCCESS = [200, 201, 204, 206];
const RETRY_BUDGET_MS = 20000;
const MAX_ATTEMPTS = 3;

function retryDelay(value, attempt) {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.floor((500 * (2 ** (attempt - 1))) * (0.5 + Math.random() * 0.5));
}

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[hlx6]', ...args);
}

function parseOrgSite(str) {
  const parts = str.trim().toLowerCase().split('/').filter((p) => p);
  if (parts.length !== 2) return undefined;
  return { org: parts[0], site: parts[1] };
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // eslint-disable-next-line no-console
        console.error('[hlx6] Invalid JSON in HLX6_MIGRATION_SITES');
        return [];
      }
    }
    return trimmed.split(/[,\n]/);
  }
  return [];
}

/**
 * Parses the HLX6_MIGRATION_SITES env value.
 * @param {string[]|string} value array (or JSON / comma separated string) of entries
 * @returns {Map<string, {org: string, site: string}>} `org/site` (DA) -> hlx6 target
 */
export function parseMigrationSites(value) {
  const map = new Map();
  for (const entry of toList(value)) {
    if (typeof entry !== 'string' || !entry.trim()) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const [from, to, ...rest] = entry.split('->');
    const source = parseOrgSite(from);
    const target = to === undefined ? source : parseOrgSite(to);
    if (!source || !target || rest.length) {
      // eslint-disable-next-line no-console
      console.error(`[hlx6] Ignoring invalid HLX6_MIGRATION_SITES entry: ${entry}`);
    } else {
      map.set(`${source.org}/${source.site}`, target);
    }
  }
  return map;
}

let cache = { key: undefined, map: new Map() };

function getMigrationSites(env) {
  const value = env?.HLX6_MIGRATION_SITES;
  const key = JSON.stringify(value) ?? '';
  if (cache.key !== key) {
    cache = { key, map: parseMigrationSites(value) };
    const type = Array.isArray(value) ? 'array' : typeof value;
    log(`HLX6_MIGRATION_SITES (${type}): ${JSON.stringify(value)}`);
    const sites = [...cache.map.entries()]
      .map(([from, to]) => `${from} -> ${to.org}/${to.site}`);
    log(`${sites.length} site(s) in migration${sites.length ? `: ${sites.join(', ')}` : ''}`);
    log(`AEM_API: ${env?.AEM_API || `${DEFAULT_AEM_API} (default)`}`);
  }
  return cache.map;
}

/**
 * Parses (and logs) the migration config if not done yet for the current env value.
 * Called on every request so the setup is visible in the logs at worker start.
 */
export function initHlx6(env) {
  getMigrationSites(env);
}

/**
 * Returns the hlx6 target for a DA org/site if that site is being migrated.
 * @returns {{org: string, site: string}|undefined}
 */
export function getHlx6Target(env, org, site) {
  if (!org || !site) return undefined;
  return getMigrationSites(env).get(`${org.toLowerCase()}/${site.toLowerCase()}`);
}

/**
 * Splits an org-relative DA key (`site/path/to/file.html`) into site and path.
 */
function splitKey(key) {
  const [site, ...rest] = (key || '').split('/').filter((p) => p);
  return { site, path: rest.length ? `/${rest.join('/')}` : '' };
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function sourceUrl(env, target, path, isFolder) {
  const api = env.AEM_API || DEFAULT_AEM_API;
  const suffix = isFolder ? '/' : '';
  return new URL(`${api}/${target.org}/sites/${target.site}/source${encodePath(path)}${suffix}`);
}

function getAuthHeaders(req) {
  const auth = req?.headers?.get('authorization');
  if (!auth) return undefined;
  const token = auth.split(',')[0].trim().split(' ').pop();
  if (!token) return undefined;
  const bearer = `Bearer ${token}`;
  return {
    authorization: bearer,
  };
}

async function hlx6FetchAttempt(url, opts, audit, metadata, deadline, attempt) {
  const requestId = crypto.randomUUID();
  const size = typeof opts.body === 'string'
    ? new TextEncoder().encode(opts.body).byteLength : opts.body?.byteLength;
  const type = opts.headers?.['content-type'];
  const details = [type, size !== undefined ? `${size} bytes` : undefined].filter((d) => d);
  log(`-> ${opts.method} ${url}${details.length ? ` (${details.join(', ')})` : ''}`);
  const start = Date.now();
  const request = {
    ...metadata,
    attempt,
    requestId,
    method: opts.method,
    url: url.toString(),
    contentType: type,
    bytes: size,
  };
  audit('request_started', request);
  let resp;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('hlx6 operation exceeded its 20-second budget'));
    }, Math.max(0, deadline - Date.now()));
  });
  try {
    resp = await Promise.race([fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { ...opts.headers, 'x-request-id': requestId },
    }), timeout]);
  } catch (e) {
    clearTimeout(timer);
    audit('request_failed', {
      ...request,
      reason: controller.signal.aborted ? 'deadline_exceeded' : 'network_error',
      error: e.message,
      remoteOutcomeUnknown: true,
      durationMs: Date.now() - start,
    });
    throw e;
  }
  const duration = Date.now() - start;

  let bodyText = '';
  let bodyReadError;
  try {
    bodyText = await Promise.race([resp.text(), timeout]);
  } catch (e) {
    bodyReadError = e.message;
    console.error('[hlx6] Unable to read response body', e);
  } finally {
    clearTimeout(timer);
  }

  const detailsList = [`requestId: ${requestId}`];
  const location = resp.headers?.get('location');
  if (location) detailsList.push(`location: ${location}`);
  const xError = resp.headers?.get('x-error');
  if (xError) detailsList.push(`x-error: ${xError}`);
  if (bodyText) {
    detailsList.push(`body: ${bodyText}`);
  } else {
    detailsList.push('body: (empty)');
  }
  const detailsSuffix = ` [${detailsList.join(', ')}]`;
  audit('request_completed', {
    ...request,
    status: resp.status,
    ok: resp.ok,
    durationMs: Date.now() - start,
    location,
    xError,
    responseRequestId: resp.headers?.get('x-request-id'),
    responseRayId: resp.headers?.get('cf-ray'),
    bodyReadError,
    responseBody: bodyText.slice(0, 8192),
    responseBodyTruncated: bodyText.length > 8192,
    retryAfter: resp.headers?.get('retry-after'),
  });

  if (resp.ok) {
    log(`<- ${opts.method} ${url}: ${resp.status} in ${duration}ms${detailsSuffix}`);
  } else {
    // eslint-disable-next-line no-console
    console.error(`[hlx6] <- ${opts.method} ${url} failed: ${resp.status} in ${duration}ms${detailsSuffix}`);
    const error = new Error(`hlx6 ${opts.method} ${url} returned ${resp.status}`);
    error.status = resp.status;
    error.xError = xError;
    error.retryAfter = resp.headers?.get('retry-after');
    error.remoteOutcomeUnknown = resp.status >= 500;
    throw error;
  }
  return resp;
}

async function hlx6Fetch(url, opts, audit, metadata, deadline) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (Date.now() >= deadline) {
      throw new Error('hlx6 operation exceeded its 20-second budget');
    }
    try {
      // Reusing a mutation after an unknown remote outcome can duplicate versions
      // or overwrite a later edit. Only an explicit rate-limit rejection is retried.
      // eslint-disable-next-line no-await-in-loop
      return await hlx6FetchAttempt(url, opts, audit, metadata, deadline, attempt);
    } catch (error) {
      const delayMs = retryDelay(error.retryAfter, attempt);
      if (error.status !== 429 || attempt === MAX_ATTEMPTS
        || Date.now() + delayMs >= deadline) {
        audit('request_exhausted', {
          ...metadata,
          method: opts.method,
          url: url.toString(),
          attempts: attempt,
          status: error.status,
          reason: error.status === 429 ? 'retry_limit' : 'not_retryable',
          remoteOutcomeUnknown: error.remoteOutcomeUnknown === true,
        });
        throw error;
      }
      audit('request_retry_scheduled', {
        ...metadata,
        method: opts.method,
        url: url.toString(),
        attempt,
        delayMs,
        status: error.status,
      });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }
  throw new Error('hlx6 retry attempts exhausted');
}

function schedule(daCtx, label, fn, audit) {
  const background = typeof daCtx.waitUntil === 'function';
  const start = Date.now();
  audit('operation_started', { background });
  log(`${label}: propagating${background ? ' (background)' : ' (no waitUntil, not awaited)'}`);
  const promise = (async () => {
    try {
      const result = await fn();
      const outcome = result === false ? 'failed' : 'succeeded';
      audit('operation_completed', { outcome, durationMs: Date.now() - start });
      log(`${label}: ${outcome}`);
    } catch (e) {
      audit('operation_completed', {
        outcome: 'failed', error: e.message, durationMs: Date.now() - start,
      });
      // eslint-disable-next-line no-console
      console.error(`[hlx6] ${label}: propagation failed`, e);
    }
  })();
  if (background) daCtx.waitUntil(promise);
  return promise;
}

/**
 * Checks the common preconditions and logs why a propagation is skipped.
 * @returns {object|undefined} propagation helpers if propagation should happen
 */
function checkSync(label, {
  req, resp, migrated, env, daCtx, details, target, src, dest,
}) {
  if (!migrated) return undefined;
  const context = {
    schemaVersion: 1,
    component: 'hlx6-migration',
    operationId: crypto.randomUUID(),
    operation: label.split(' ')[0],
    environment: env.ENVIRONMENT,
    deploymentVersion: env.VERSION,
    daRequestId: req?.headers?.get('cf-ray') || req?.headers?.get('x-request-id'),
    daMethod: req?.method,
    daOrg: daCtx.org,
    daKey: daCtx.key,
    daStatus: resp?.status,
    daEtag: resp?.etag,
    daDocumentId: resp?.metadata?.id,
    source: details?.source,
    destination: details?.destination,
    continuation: !!details?.continuationToken,
    daPartial: resp?.status === 206,
    target,
    sourceTarget: src?.target,
    destinationTarget: dest?.target,
    actors: daCtx.users?.map(({ email }) => email).filter(Boolean),
  };
  const audit = (event, fields = {}) => {
    console.log('[hlx6:event]', JSON.stringify({
      ...context, event, timestamp: new Date().toISOString(), ...fields,
    }));
  };
  audit('operation_observed');
  const skip = (reason) => audit('operation_skipped', { reason });
  if (!SUCCESS.includes(resp?.status)) {
    skip('da_unsuccessful');
    log(`${label}: skipped, DA status ${resp?.status}`);
    return undefined;
  }
  const headers = getAuthHeaders(req);
  if (!headers) {
    skip('missing_authorization');
    return undefined;
  }
  const deadline = Date.now() + RETRY_BUDGET_MS;
  return {
    audit,
    skip,
    fetch: (url, opts, metadata) => hlx6Fetch(url, {
      ...opts, headers: { ...headers, ...opts.headers },
    }, audit, metadata, deadline),
    schedule: (fn) => schedule(daCtx, label, fn, audit),
  };
}

export function logMediaMigration({
  req, env, daCtx, resp,
}) {
  const { site } = splitKey(daCtx.key);
  const target = getHlx6Target(env, daCtx.org, site);
  const sync = checkSync(`MEDIA ${daCtx.org}/${daCtx.key}`, {
    req, resp, migrated: !!target, env, daCtx, target,
  });
  if (sync) sync.skip('media_upload_not_propagated');
}

async function toBody(data, ext) {
  if (data instanceof File || data instanceof Blob) {
    return { body: await data.arrayBuffer(), type: data.type };
  }
  if (typeof data === 'string') {
    return { body: data, type: ext === 'html' ? 'text/html' : 'application/json' };
  }
  return { body: JSON.stringify(data), type: 'application/json' };
}

async function postFile(env, sync, target, path, data, ext) {
  const { body, type } = await toBody(data, ext);
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const payloadSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return sync.fetch(sourceUrl(env, target, path), {
    method: 'POST',
    headers: type ? { 'content-type': type } : {},
    body,
  }, { payloadSha256 });
}

function fmtTarget(target) {
  return target ? `${target.org}/${target.site}` : 'none';
}

/**
 * Propagates a successful DA source write (POST/PUT /source).
 * @param {object} opts
 * @param {object} opts.obj the object returned by putHelper (undefined/null creates a folder)
 * @param {object} opts.resp the DA response object
 */
export function syncSourcePut({
  req, env, daCtx, obj, resp,
}) {
  const { site, path } = splitKey(daCtx.key);
  const target = getHlx6Target(env, daCtx.org, site);
  const label = `PUT ${daCtx.org}/${daCtx.key} (hlx6: ${fmtTarget(target)})`;
  const sync = checkSync(label, {
    req, resp, migrated: !!target, env, daCtx, target,
  });
  if (!sync) return undefined;
  if (!path) {
    sync.skip('site_root');
    log(`${label}: skipped, site root`);
    return undefined;
  }

  if (obj?.data) {
    return sync.schedule(() => postFile(env, sync, target, path, obj.data, daCtx.ext));
  }
  if (!obj) {
    return sync.schedule(() => sync.fetch(sourceUrl(env, target, path, true), { method: 'POST' }));
  }
  sync.skip('missing_data');
  log(`${label}: skipped, no data in request`);
  return undefined;
}

/**
 * Propagates a successful DA delete (DELETE /source). Folders are deleted in one go on hlx6,
 * so only the first request of a paginated DA delete (no continuation token) is propagated.
 */
export function syncSourceDelete({
  req, env, daCtx, details, resp,
}) {
  const { site, path } = splitKey(daCtx.key);
  const target = getHlx6Target(env, daCtx.org, site);
  const label = `DELETE ${daCtx.org}/${daCtx.key} (hlx6: ${fmtTarget(target)})`;
  const sync = checkSync(label, {
    req, resp, migrated: !!target, env, daCtx, details, target,
  });
  if (!sync) return undefined;
  if (details?.continuationToken) {
    sync.skip('continuation');
    log(`${label}: skipped, continuation request (already propagated)`);
    return undefined;
  }
  if (!path) {
    sync.skip('site_root');
    log(`${label}: skipped, site root`);
    return undefined;
  }

  return sync.schedule(() => sync.fetch(
    sourceUrl(env, target, path, !daCtx.isFile),
    { method: 'DELETE' },
  ));
}

function sameTarget(a, b) {
  return a && b && a.org === b.org && a.site === b.site;
}

/**
 * Copies on hlx6. Within the same hlx6 site, a server side copy is used. Otherwise (source not
 * migrated or migrated to another hlx6 site), files are re-uploaded from the DA bucket; folders
 * cannot be propagated and are only logged.
 * @returns {Promise<boolean>} true if the copy was propagated successfully
 */
async function copyOnHlx6(env, daCtx, sync, src, dest) {
  const isFolder = !daCtx.isFile;
  if (sameTarget(src.target, dest.target)) {
    log(`server side ${isFolder ? 'folder' : 'file'} copy ${src.path} -> ${dest.path} on ${fmtTarget(dest.target)}`);
    const url = sourceUrl(env, dest.target, dest.path, isFolder);
    url.searchParams.set('source', isFolder ? `${src.path}/` : src.path);
    url.searchParams.set('collision', 'overwrite');
    try {
      const resp = await sync.fetch(url, { method: 'PUT' }, { step: 'copy' });
      sync.audit('operation_checkpoint', { step: 'copy_completed' });
      return resp.ok;
    } catch (error) {
      if (error.status !== 404 || !['[admin] Not found', '[AWS] Not Found'].includes(error.xError)) {
        throw error;
      }
      sync.audit('operation_checkpoint', {
        step: 'copy_source_missing',
        source: `${src.site}${src.path}`,
        destination: `${dest.site}${dest.path}`,
        recovery: isFolder ? 'Reconcile the DA destination folder before deleting the target source.' : 'Upload the committed DA destination.',
      });
      if (isFolder) return false;
    }
  }
  if (isFolder) {
    sync.audit('propagation_unsupported', { reason: 'cross_site_folder' });
    // eslint-disable-next-line no-console
    console.warn(`[hlx6] Cross-site folder copy to ${daCtx.org}/${dest.site}${dest.path} is not propagated`);
    return false;
  }
  const key = `${daCtx.org}/${dest.site}${dest.path}`;
  log(`cross-site file copy: re-uploading ${key} from DA to ${fmtTarget(dest.target)}`);
  const obj = await env.AEM_CONTENT.get(key);
  if (!obj) {
    sync.audit('propagation_failed', { reason: 'da_object_missing', key });
    // eslint-disable-next-line no-console
    console.error(`[hlx6] Copied object ${key} not found in DA`);
    return false;
  }
  const data = new Blob([await obj.arrayBuffer()], { type: obj.httpMetadata?.contentType });
  sync.audit('operation_checkpoint', {
    step: 'destination_read',
    key,
    destinationEtag: obj.etag,
    destinationDocumentId: obj.customMetadata?.id,
  });
  const resp = await postFile(env, sync, dest.target, dest.path, data, daCtx.ext);
  sync.audit('operation_checkpoint', { step: 'copy_completed', key });
  return resp.ok;
}

function resolveCopyMove(env, daCtx, details) {
  const src = splitKey(details?.source);
  const dest = splitKey(details?.destination);
  src.target = getHlx6Target(env, daCtx.org, src.site);
  dest.target = getHlx6Target(env, daCtx.org, dest.site);
  return { src, dest };
}

/**
 * Propagates a successful DA copy (POST /copy). Only the first request of a paginated
 * DA copy (no continuation token) is propagated.
 */
export function syncCopy({
  req, env, daCtx, details, resp,
}) {
  const { src, dest } = resolveCopyMove(env, daCtx, details);
  const label = `COPY ${daCtx.org}/${details?.source} -> ${daCtx.org}/${details?.destination} (hlx6: ${fmtTarget(src.target)} -> ${fmtTarget(dest.target)})`;
  const sync = checkSync(label, {
    req, resp, migrated: !!dest.target, env, daCtx, details, src, dest,
  });
  if (!sync) return undefined;
  if (details?.continuationToken) {
    sync.skip('continuation');
    log(`${label}: skipped, continuation request (already propagated)`);
    return undefined;
  }
  if (!src.path || !dest.path) {
    sync.skip('site_root');
    log(`${label}: skipped, site root`);
    return undefined;
  }

  return sync.schedule(() => copyOnHlx6(env, daCtx, sync, src, dest));
}

/**
 * Propagates a successful DA move (POST /move) as copy + delete, since hlx6 has no move.
 * The source is only deleted on hlx6 if the copy succeeded (or the destination is not migrated).
 */
export function syncMove({
  req, env, daCtx, details, resp,
}) {
  const { src, dest } = resolveCopyMove(env, daCtx, details);
  const label = `MOVE ${daCtx.org}/${details?.source} -> ${daCtx.org}/${details?.destination} (hlx6: ${fmtTarget(src.target)} -> ${fmtTarget(dest.target)})`;
  const sync = checkSync(label, {
    req, resp, migrated: !!(src.target || dest.target), env, daCtx, details, src, dest,
  });
  if (!sync) return undefined;
  if (details?.continuationToken || resp?.status === 206) {
    sync.skip('partial_move');
    log(`${label}: skipped, partial DA move requires reconciliation`);
    return undefined;
  }
  if (!src.path || !dest.path) {
    sync.skip('site_root');
    log(`${label}: skipped, site root`);
    return undefined;
  }

  return sync.schedule(async () => {
    if (dest.target) {
      const copied = await copyOnHlx6(env, daCtx, sync, src, dest);
      if (!copied) {
        log(`${label}: copy failed, source not deleted on hlx6`);
        return false;
      }
    }
    if (src.target) {
      sync.audit('operation_checkpoint', { step: 'delete_started' });
      await sync.fetch(
        sourceUrl(env, src.target, src.path, !daCtx.isFile),
        { method: 'DELETE' },
        { step: 'delete' },
      );
      sync.audit('operation_checkpoint', { step: 'delete_completed' });
    }
    return true;
  });
}

/**
 * Propagates a successful DA version creation (POST /versionsource).
 */
export function syncVersion({
  req, env, daCtx, label: comment, resp,
}) {
  const { site, path } = splitKey(daCtx.key);
  const target = getHlx6Target(env, daCtx.org, site);
  const label = `VERSION ${daCtx.org}/${daCtx.key} (hlx6: ${fmtTarget(target)})`;
  const sync = checkSync(label, {
    req, resp, migrated: !!target, env, daCtx, target,
  });
  if (!sync) return undefined;
  if (!path) {
    sync.skip('site_root');
    log(`${label}: skipped, site root`);
    return undefined;
  }

  const url = new URL(`${sourceUrl(env, target, path)}/.versions`);
  if (comment) url.searchParams.set('comment', comment);
  return sync.schedule(() => sync.fetch(url, { method: 'POST' }));
}
