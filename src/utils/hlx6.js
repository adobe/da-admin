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

async function hlx6Fetch(url, opts) {
  const size = opts.body?.byteLength ?? opts.body?.length;
  const type = opts.headers?.['content-type'];
  const details = [type, size !== undefined ? `${size} bytes` : undefined].filter((d) => d);
  log(`-> ${opts.method} ${url}${details.length ? ` (${details.join(', ')})` : ''}`);
  const start = Date.now();
  const resp = await fetch(url, opts);
  const duration = Date.now() - start;

  let bodyText = '';
  try {
    bodyText = await resp.text();
  } catch {
    // ignore
  }

  const detailsList = [];
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

  if (resp.ok) {
    log(`<- ${opts.method} ${url}: ${resp.status} in ${duration}ms${detailsSuffix}`);
  } else {
    // eslint-disable-next-line no-console
    console.error(`[hlx6] <- ${opts.method} ${url} failed: ${resp.status} in ${duration}ms${detailsSuffix}`);
  }
  return resp;
}

function schedule(daCtx, label, fn) {
  const background = typeof daCtx.waitUntil === 'function';
  log(`${label}: propagating${background ? ' (background)' : ' (no waitUntil, not awaited)'}`);
  const promise = (async () => {
    try {
      await fn();
      log(`${label}: finished`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[hlx6] ${label}: propagation failed`, e);
    }
  })();
  if (background) daCtx.waitUntil(promise);
  return promise;
}

/**
 * Checks the common preconditions and logs why a propagation is skipped.
 * @returns {object|undefined} the auth headers if propagation should happen
 */
function checkSync(label, { req, resp, migrated }) {
  if (!migrated) {
    log(`${label}: skipped, site not in migration`);
    return undefined;
  }
  if (!SUCCESS.includes(resp?.status)) {
    log(`${label}: skipped, DA status ${resp?.status}`);
    return undefined;
  }
  const headers = getAuthHeaders(req);
  if (!headers) log(`${label}: skipped, no authorization header`);
  return headers;
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

async function postFile(env, headers, target, path, data, ext) {
  const { body, type } = await toBody(data, ext);
  return hlx6Fetch(sourceUrl(env, target, path), {
    method: 'POST',
    headers: { ...headers, ...(type ? { 'content-type': type } : {}) },
    body,
  });
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
  const headers = checkSync(label, { req, resp, migrated: !!target });
  if (!headers) return undefined;
  if (!path) {
    log(`${label}: skipped, site root`);
    return undefined;
  }

  if (obj?.data) {
    return schedule(daCtx, label, () => postFile(env, headers, target, path, obj.data, daCtx.ext));
  }
  if (!obj) {
    return schedule(daCtx, `${label} [folder]`, () => hlx6Fetch(sourceUrl(env, target, path, true), { method: 'POST', headers }));
  }
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
  const headers = checkSync(label, { req, resp, migrated: !!target });
  if (!headers) return undefined;
  if (details?.continuationToken) {
    log(`${label}: skipped, continuation request (already propagated)`);
    return undefined;
  }
  if (!path) {
    log(`${label}: skipped, site root`);
    return undefined;
  }

  return schedule(daCtx, label, () => hlx6Fetch(
    sourceUrl(env, target, path, !daCtx.isFile),
    { method: 'DELETE', headers },
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
async function copyOnHlx6(env, daCtx, headers, src, dest) {
  const isFolder = !daCtx.isFile;
  if (sameTarget(src.target, dest.target)) {
    log(`server side ${isFolder ? 'folder' : 'file'} copy ${src.path} -> ${dest.path} on ${fmtTarget(dest.target)}`);
    const url = sourceUrl(env, dest.target, dest.path, isFolder);
    url.searchParams.set('source', isFolder ? `${src.path}/` : src.path);
    url.searchParams.set('collision', 'overwrite');
    const resp = await hlx6Fetch(url, { method: 'PUT', headers });
    return resp.ok;
  }
  if (isFolder) {
    // eslint-disable-next-line no-console
    console.warn(`[hlx6] Cross-site folder copy to ${daCtx.org}/${dest.site}${dest.path} is not propagated`);
    return false;
  }
  const key = `${daCtx.org}/${dest.site}${dest.path}`;
  log(`cross-site file copy: re-uploading ${key} from DA to ${fmtTarget(dest.target)}`);
  const obj = await env.AEM_CONTENT.get(key);
  if (!obj) {
    // eslint-disable-next-line no-console
    console.error(`[hlx6] Copied object ${key} not found in DA`);
    return false;
  }
  const data = new Blob([await obj.arrayBuffer()], { type: obj.httpMetadata?.contentType });
  const resp = await postFile(env, headers, dest.target, dest.path, data, daCtx.ext);
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
  const headers = checkSync(label, { req, resp, migrated: !!dest.target });
  if (!headers) return undefined;
  if (details?.continuationToken) {
    log(`${label}: skipped, continuation request (already propagated)`);
    return undefined;
  }
  if (!src.path || !dest.path) {
    log(`${label}: skipped, site root`);
    return undefined;
  }

  return schedule(daCtx, label, () => copyOnHlx6(env, daCtx, headers, src, dest));
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
  const headers = checkSync(label, { req, resp, migrated: !!(src.target || dest.target) });
  if (!headers) return undefined;
  if (!src.path || !dest.path) {
    log(`${label}: skipped, site root`);
    return undefined;
  }

  return schedule(daCtx, label, async () => {
    if (dest.target) {
      const copied = await copyOnHlx6(env, daCtx, headers, src, dest);
      if (!copied) {
        log(`${label}: copy failed, source not deleted on hlx6`);
        return;
      }
    }
    if (src.target) {
      await hlx6Fetch(sourceUrl(env, src.target, src.path, !daCtx.isFile), { method: 'DELETE', headers });
    }
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
  const headers = checkSync(label, { req, resp, migrated: !!target });
  if (!headers) return undefined;
  if (!path) {
    log(`${label}: skipped, site root`);
    return undefined;
  }

  const url = new URL(`${sourceUrl(env, target, path)}/.versions`);
  if (comment) url.searchParams.set('comment', comment);
  return schedule(daCtx, label, () => hlx6Fetch(url, { method: 'POST', headers }));
}
