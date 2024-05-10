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
import copyObject from './copy.js';
import deleteObjects from './delete.js';

const rename = async (env, daCtx, details) => {
  try {
    await copyObject(env, daCtx, details);
    await deleteObjects(env, daCtx);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e);
  }
};

export default async function renameObject(env, daCtx, details) {
  try {
    await rename(env, daCtx, details);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e);
  }
  return { status: 204 };
}
