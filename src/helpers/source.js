/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { FORM_TYPES } from '../utils/constants.js';

/**
 * Builds a source response
 * @param {*} key
 */
export function sourceRespObject(daCtx, props) {
  const {
    org, site, isFile, pathname, aemPathname,
  } = daCtx;

  const obj = {
    source: {
      editUrl: `https://da.live/${isFile ? 'edit#/' : ''}${org}${pathname}`,
      contentUrl: `https://content.da.live/${org}${pathname}`,
    },
  };

  if (props) obj.source.props = props;

  if (site) {
    obj.aem = {
      previewUrl: `https://main--${site}--${org}.hlx.page${aemPathname}`,
      liveUrl: `https://main--${site}--${org}.hlx.live${aemPathname}`,
    };
  }

  return obj;
}

function getFormEntries(formData) {
  const entries = {};

  if (formData.get('data')) {
    entries.data = formData.get('data');
  }

  if (formData.get('props')) {
    entries.props = JSON.parse(formData.get('props'));
  }

  if (formData.get('file')) {
    entries.file = formData.get('file');
  }

  return entries;
}

async function formPutHandler(req) {
  let formData;
  try {
    formData = await req.formData();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('No form data', e);
  }
  return formData ? getFormEntries(formData) : null;
}

export default async function putHelper(req, env, daCtx) {
  const contentType = req.headers.get('content-type')?.split(';')[0];

  if (FORM_TYPES.some((type) => type === contentType)) return formPutHandler(req, env, daCtx);

  if (!contentType) return null;

  return undefined;
}
