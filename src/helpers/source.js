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
import { FORM_TYPES, SUPPORTED_TYPES, MEDIA_TYPES } from '../utils/constants.js';
import normalizeCharset from '../utils/charset.js';
import { SanitizeError, sanitizeUpload } from '../utils/sanitize.js';

/**
 * Builds a source response
 * @param {*} key
 */
export function sourceRespObject(env, daCtx) {
  const {
    org, site, isFile, pathname, aemPathname,
  } = daCtx;

  const obj = {
    source: {
      editUrl: `https://da.live/${isFile ? 'edit#/' : ''}${org}${pathname}`,
      contentUrl: `${env.DA_CONTENT}/${org}${pathname}`,
    },
  };

  if (site) {
    obj.aem = {
      previewUrl: `https://main--${site}--${org}.aem.page${aemPathname}`,
      liveUrl: `https://main--${site}--${org}.aem.live${aemPathname}`,
    };
  }

  return obj;
}

function getFormEntries(formData) {
  const entries = {};

  if (formData.get('data')) {
    entries.data = formData.get('data');
    entries.guid = formData.get('guid');
  }

  return entries;
}

async function formPutHandler(req) {
  let formData;
  try {
    formData = await req.formData();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('No form data');
  }
  return formData ? getFormEntries(formData) : null;
}

async function rawBodyPutHandler(req, contentType) {
  if (typeof req.text !== 'function') return null;
  const body = await req.text();
  if (!body) return null;

  const normalized = normalizeCharset(contentType);
  const data = new File([body], 'source', { type: normalized });
  return { data };
}

export async function putHelper(req, env, daCtx) {
  const rawContentType = req.headers.get('content-type');
  if (!rawContentType) return null;

  const contentType = rawContentType.split(';')[0].trim();

  if (FORM_TYPES.some((type) => type === contentType)) return formPutHandler(req, env, daCtx);

  if (SUPPORTED_TYPES.includes(contentType) && !MEDIA_TYPES.includes(contentType)) {
    return rawBodyPutHandler(req, contentType);
  }

  return undefined;
}

export async function getFileBody(data) {
  await data.text();
  return { body: data, type: normalizeCharset(data.type) };
}

/**
 * Sanitises an upload parsed by `putHelper`, mapping rejections to a response object.
 * @returns {Promise<{obj?: Object, changed?: boolean, error?: Object}>}
 */
export async function sanitizeOrReject(obj, daCtx, env) {
  try {
    return await sanitizeUpload(obj, daCtx, env);
  } catch (e) {
    if (!(e instanceof SanitizeError)) throw e;
    return { error: { status: e.status, body: JSON.stringify({ error: e.message }) } };
  }
}

export function getObjectBody(data) {
  // TODO: This will not correctly handle HTML as data
  return { body: JSON.stringify(data), type: 'application/json' };
}
