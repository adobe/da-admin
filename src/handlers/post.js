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
import { postSource } from '../routes/source.js';
import { postConfig } from '../routes/config.js';
import { postVersionSource } from '../routes/version.js';
import copyHandler from '../routes/copy.js';
import renameHandler from '../routes/rename.js';
import moveRoute from '../routes/move.js';

export default async function postHandler({ req, env, daCtx }) {
  const { path } = daCtx;

  if (path.startsWith('/source')) return postSource({ req, env, daCtx });
  if (path.startsWith('/config')) return postConfig({ req, env, daCtx });
  if (path.startsWith('/versionsource')) return postVersionSource({ req, env, daCtx });
  if (path.startsWith('/copy')) return copyHandler({ req, env, daCtx });
  if (path.startsWith('/rename')) return renameHandler({ req, env, daCtx });
  if (path.startsWith('/move')) return moveRoute({ req, env, daCtx });

  return undefined;
}
