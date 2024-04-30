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
import { getSource } from '../routes/source.js';
import getList from '../routes/list.js';
import { getConfig } from '../routes/config.js';
import { getVersionSource, getVersionList } from '../routes/version.js';

function get404() {
  return { body: '', status: 404 };
}

function getRobots() {
  const body = 'User-agent: *\nDisallow: /';
  return { body, status: 200 };
}

export default async function getHandler({ env, daCtx }) {
  const { path } = daCtx;

  if (path.startsWith('/favicon.ico')) return get404();
  if (path.startsWith('/robots.txt')) return getRobots();

  if (path.startsWith('/source')) return getSource({ env, daCtx });
  if (path.startsWith('/list')) return getList({ env, daCtx });
  if (path.startsWith('/config')) return getConfig({ env, daCtx });
  if (path.startsWith('/versionlist')) return getVersionList({ env, daCtx });
  if (path.startsWith('/versionsource')) return getVersionSource({ env, daCtx });

  return undefined;
}
