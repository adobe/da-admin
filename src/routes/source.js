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
import getObject from '../storage/object/get.js';
import putObject from '../storage/object/put.js';
import deleteObject from '../storage/object/delete.js';

import putHelper from '../helpers/source.js';
import putDocx2HTML from '../word/daDocx2HTML.js';

export async function deleteSource({ env, daCtx }) {
  return deleteObject(env, daCtx);
}

export async function postSource({ req, env, daCtx }) {
  if (daCtx.ext === 'docx') {
    return putDocx2HTML(req, env, daCtx);
  }
  const obj = await putHelper(req, env, daCtx);
  return putObject(env, daCtx, obj);
}

export async function getSource({ env, daCtx }) {
  return getObject(env, daCtx);
}
