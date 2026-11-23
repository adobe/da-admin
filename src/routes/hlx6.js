/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import daResp from '../utils/daResp.js';
import { DEFAULT_AEM_API, HLX6_GONE, isHlx6Site } from '../utils/hlx6.js';
import { getChildRules, hasDescendantPermission, hasPermission } from '../utils/auth.js';
import { FORM_TYPES } from '../utils/constants.js';
import { sourceRespObject } from '../helpers/source.js';
import formatList from '../storage/utils/list.js';
import { filterUnauthorized } from '../storage/object/list.js';
import { hasConfigPermission } from './config.js';
import getList from './list.js';

function errorResponse(status, error, head = false) {
  const resp = daResp({ status, error, body: head ? undefined : JSON.stringify({ error }) });
  resp.headers.set('cache-control', 'private, no-store');
  return resp;
}

function adaptedResponse(upstream, {
  body = upstream.body, status = upstream.status, head = false,
  contentType = upstream.headers.get('content-type') || 'application/json',
} = {}) {
  const resp = daResp({
    status,
    body: head || status === 204 || status === 304 ? undefined : body,
    contentType,
    contentLength: head ? upstream.headers.get('content-length') : undefined,
    etag: upstream.headers.get('etag'),
    metadata: { LastModified: upstream.headers.get('last-modified') },
  });
  resp.headers.set('cache-control', 'private, no-store');
  ['x-error', 'x-error-code', 'retry-after'].forEach((name) => {
    const value = upstream.headers.get(name);
    if (value) resp.headers.set(name, value);
  });
  resp.headers.append('access-control-expose-headers', 'x-error-code, Retry-After, Last-Modified, Location');
  // DA ACL hints and UUIDs do not describe the upstream's permissions or document IDs.
  return resp;
}

async function requestHlx6(req, env, path, { method = req.method, body, type } = {}) {
  const auth = req.headers.get('authorization') || '';
  if (auth.includes(',')) {
    return errorResponse(410, 'Multiple author tokens are not supported by the Helix 6 bridge.', method === 'HEAD');
  }
  if (!/^Bearer \S+$/i.test(auth)) return errorResponse(401, 'A caller Bearer token is required.', method === 'HEAD');

  const url = `${env.AEM_API || DEFAULT_AEM_API}/${path}`;
  const headers = new Headers({ authorization: auth });
  if (type) headers.set('content-type', type);
  ['if-match', 'if-none-match'].forEach((name) => {
    if (req.headers.has(name)) headers.set(name, req.headers.get(name));
  });
  try {
    const resp = await fetch(url, {
      method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(20000),
    });
    if (resp.status >= 400) console.error('[hlx6] Bridge upstream error', method, path, resp.status);
    return resp;
  } catch (e) {
    console.error('[hlx6] Bridge request failed', method, path, e.name);
    return errorResponse(502, 'Helix 6 request failed; mutations are not automatically retried.', method === 'HEAD');
  }
}

function siteSourcePath(daCtx, folder = false) {
  const [site, ...parts] = daCtx.key.split('/');
  const path = parts.map(encodeURIComponent).join('/');
  return `${daCtx.org}/sites/${site}/source${path ? `/${path}` : ''}${folder ? '/' : ''}`;
}

function toSheets(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)
    || !Object.values(obj).every(Array.isArray)) throw new Error('Expected editor sheet arrays');
  const names = Object.keys(obj);
  const sheet = (data) => ({
    total: data.length, limit: data.length, offset: 0, data,
  });
  if (names.length === 1) {
    return { ...sheet(obj[names[0]]), ':sheetname': names[0], ':type': 'sheet' };
  }
  return Object.fromEntries([
    [':type', 'multi-sheet'], [':names', names],
    ...names.map((name) => [name, sheet(obj[name])]),
  ]);
}

function fromSheets(json) {
  if (json?.[':type'] === 'sheet') {
    if (typeof json[':sheetname'] !== 'string' || !json[':sheetname']) throw new Error('Missing sheet name');
    return Object.fromEntries([[json[':sheetname'], json.data]]);
  }
  if (json?.[':type'] === 'multi-sheet') {
    const names = json[':names'];
    if (!Array.isArray(names) || names.some((name) => typeof name !== 'string' || !name)
      || new Set(names).size !== names.length) throw new Error('Invalid sheet names');
    return Object.fromEntries(names.map((name) => [name, json[name]?.data]));
  }
  return json;
}

function legacyList(daCtx, items) {
  if (!Array.isArray(items)) throw new Error('Expected a source listing array');
  const CommonPrefixes = [];
  const Contents = [];
  const prefix = `${daCtx.org}/${daCtx.key ? `${daCtx.key}/` : ''}`;
  items.forEach((item) => {
    if (typeof item?.name !== 'string' || !item.name
      || item.name.replace(/\/$/, '').includes('/')) throw new Error('Invalid source listing name');
    if (item.name.endsWith('/')) {
      CommonPrefixes.push({ Prefix: `${prefix}${item.name}` });
    } else {
      const LastModified = new Date(item['last-modified']);
      if (!Number.isFinite(LastModified.getTime())) throw new Error('Invalid source listing date');
      Contents.push({ Key: `${prefix}${item.name}`, LastModified });
    }
  });
  const result = formatList({ CommonPrefixes, Contents });
  return hasPermission(daCtx, daCtx.key, 'read') ? result : filterUnauthorized(daCtx, result);
}

async function listSource({ req, env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'read') && !hasDescendantPermission(daCtx, daCtx.key, 'read')) {
    return errorResponse(403, 'No listing permission.');
  }
  if (daCtx.continuationToken) return errorResponse(400, 'Helix 6 source listings are not paginated.');
  getChildRules(daCtx);
  const upstream = await requestHlx6(req, env, siteSourcePath(daCtx, true));
  if (!upstream.ok) return adaptedResponse(upstream);
  try {
    const body = JSON.stringify(legacyList(daCtx, await upstream.json()));
    return adaptedResponse(upstream, { body, contentType: 'application/json' });
  } catch (e) {
    console.error('[hlx6] Invalid listing response', e.message);
    return errorResponse(502, 'Invalid Helix 6 listing response.');
  }
}

export async function listHlx6Org({ req, env, daCtx }) {
  const legacy = await getList({ env, daCtx });
  if (legacy.status !== 200) return daResp(legacy, daCtx);
  let items = JSON.parse(legacy.body).filter((item) => !isHlx6Site(env, daCtx.org, item.name));
  if (!daCtx.continuationToken) {
    const upstream = await requestHlx6(req, env, `${daCtx.org}/source/`);
    if (!upstream.ok) return adaptedResponse(upstream);
    try {
      const migrated = legacyList(daCtx, await upstream.json())
        .filter((item) => isHlx6Site(env, daCtx.org, item.name));
      items = [...items, ...migrated];
    } catch (e) {
      console.error('[hlx6] Invalid org listing response', e.message);
      return errorResponse(502, 'Invalid Helix 6 org listing response.');
    }
  }
  const unique = [...new Map(items.map((item) => [item.name, item])).values()];
  unique.sort((a, b) => a.name.localeCompare(b.name));
  const resp = daResp({ ...legacy, body: JSON.stringify(unique) }, daCtx);
  resp.headers.set('cache-control', 'private, no-store');
  return resp;
}

async function configSource({ req, env, daCtx }) {
  const write = req.method !== 'GET';
  if (!hasConfigPermission(daCtx, write ? 'write' : 'read')) return errorResponse(403, 'No config permission.');
  const [site, ...parts] = daCtx.key.split('/');
  if (parts.length) return errorResponse(410, 'Only site editor configuration is supported by the Helix 6 bridge.');
  const path = `${daCtx.org}/sites/${site}/config/editor/da.json`;
  let config;
  if (write) {
    try {
      const form = await req.formData();
      const data = form.get('config');
      if (typeof data !== 'string') throw new Error('Missing config form field');
      config = fromSheets(JSON.parse(data));
      toSheets(config);
    } catch (e) {
      return errorResponse(400, `Invalid editor configuration: ${e.message}`);
    }
  }
  const upstream = await requestHlx6(req, env, path, write ? {
    method: 'POST', body: JSON.stringify(config), type: 'application/json',
  } : {});
  if (!upstream.ok) return adaptedResponse(upstream);
  try {
    const body = JSON.stringify(toSheets(write ? config : await upstream.json()));
    return adaptedResponse(upstream, { body, contentType: 'application/json' });
  } catch (e) {
    console.error('[hlx6] Invalid editor config response', e.message);
    return errorResponse(502, 'Invalid Helix 6 editor configuration response.');
  }
}

async function readSource({ req, env, daCtx }) {
  const head = req.method === 'HEAD';
  if (!hasPermission(daCtx, daCtx.key, 'read')) return errorResponse(403, 'No source permission.', head);
  const upstream = await requestHlx6(req, env, siteSourcePath(daCtx));
  let { status } = upstream;
  if (upstream.ok) {
    const etag = upstream.headers.get('etag');
    const { ifMatch, ifNoneMatch } = daCtx.conditionalHeaders;
    const matches = (value, weak) => value.split(',').some((tag) => {
      if (tag.trim() === '*') return true;
      if (!etag) return false;
      if (weak) return tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, '');
      return !tag.trim().startsWith('W/') && !etag.startsWith('W/') && tag.trim() === etag;
    });
    if (ifNoneMatch && matches(ifNoneMatch, true)) status = 304;
    else if (!ifNoneMatch && ifMatch && !matches(ifMatch, false)) status = 412;
  }
  if (status !== upstream.status) await upstream.body?.cancel();
  return adaptedResponse(upstream, {
    status, body: status === 412 ? null : upstream.body, head,
  });
}

async function saveSource({ req, env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'write')) return errorResponse(403, 'No source write permission.');
  if (req.headers.get('x-da-initiator') === 'collab') {
    return errorResponse(410, 'Collaborative writes are not supported by the Helix 6 bridge.');
  }
  let type = req.headers.get('content-type')?.split(';')[0].trim();
  let body;
  try {
    if (FORM_TYPES.includes(type)) {
      const form = await req.formData();
      if (form.get('guid')) return errorResponse(410, 'DA document GUIDs are not supported by the Helix 6 bridge.');
      const data = form.get('data');
      if (data === null) return errorResponse(400, 'Missing data form field.');
      body = typeof data === 'string' ? data : await data.arrayBuffer();
      if (typeof data === 'string') {
        type = daCtx.ext === 'html' ? 'text/html' : 'application/json';
      } else {
        ({ type } = data);
      }
    } else {
      body = await req.arrayBuffer();
    }
  } catch (e) {
    return errorResponse(400, `Invalid source upload: ${e.message}`);
  }
  const empty = body.byteLength === 0 || body === '';
  if (empty && daCtx.isFile) return errorResponse(400, 'Missing source content.');
  if (!empty && !daCtx.isFile) return errorResponse(410, 'Extensionless file writes are not supported by the Helix 6 bridge.');
  const upstream = await requestHlx6(req, env, siteSourcePath(daCtx, empty), {
    method: 'POST', body: empty ? undefined : body, type: empty ? undefined : type,
  });
  if (!upstream.ok) return adaptedResponse(upstream);
  const [site] = daCtx.key.split('/');
  let context = { ...daCtx, site, aemPathname: daCtx.key === site ? '/' : daCtx.aemPathname };
  const location = upstream.headers.get('location');
  let legacyLocation;
  if (location) {
    const base = env.AEM_API || DEFAULT_AEM_API;
    const url = new URL(location, `${base}/${siteSourcePath(daCtx, empty)}`);
    const prefix = `/${daCtx.org}/sites/${site}/source/`;
    const siteRelative = location.startsWith('/') && !location.startsWith('//');
    if (url.origin !== new URL(base).origin
      || (!siteRelative && !url.pathname.startsWith(prefix))) {
      return errorResponse(502, 'Helix 6 saved content but returned an unexpected location; do not blindly retry.');
    }
    // Source POST returns a site-relative Location; version URLs use a full API path.
    const path = decodeURIComponent(url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length - 1) : url.pathname);
    const editPath = path.replace(/\.html$/, '').replace(/\/$/, '');
    context = { ...context, pathname: `/${site}${editPath}`, aemPathname: editPath || '/' };
    legacyLocation = `${new URL(req.url).origin}/source/${daCtx.org}/${site}${path}`;
  }
  const result = sourceRespObject(env, context);
  const resp = adaptedResponse(upstream, { body: JSON.stringify(result), contentType: 'application/json' });
  if (legacyLocation) resp.headers.set('location', legacyLocation);
  return resp;
}

export default async function hlx6Handler({ req, env, daCtx }) {
  const { api, key } = daCtx;
  if (key.split('/').some((part) => ['.versions', '.history'].includes(part))) {
    return errorResponse(404, 'Reserved history path.', req.method === 'HEAD');
  }
  if (api === 'source') {
    if (req.method === 'GET' || req.method === 'HEAD') return readSource({ req, env, daCtx });
    if (req.method === 'PUT' || req.method === 'POST') return saveSource({ req, env, daCtx });
  }
  if (api === 'list' && req.method === 'GET') return listSource({ req, env, daCtx });
  if (api === 'config' && ['GET', 'PUT', 'POST'].includes(req.method)) return configSource({ req, env, daCtx });
  return errorResponse(HLX6_GONE.status, 'This operation is not supported by the Helix 6 bridge. Use https://api.aem.live instead.', req.method === 'HEAD');
}
