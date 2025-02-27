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

function checkConfigWriter(json) {
  // Handle both single and multi-sheet
  const data = json[':sheetname'] === 'permissions' && json[':type'] === 'sheet'
    ? json.data
    : json?.permissions?.data;

  if (!data) return true; // Not a permission sheet

  return data.some((e) => e.path?.trim() === 'CONFIG' && e.actions?.trim() === 'write' && e.groups?.trim().length > 0);
}

async function save(env, key, string) {
  let body;
  let status;
  try {
    // Parse it to at least validate its json
    const json = JSON.parse(string);

    if (!checkConfigWriter(json)) {
      return {
        body: JSON.stringify({ error: 'Should at least specify one user or group that has CONFIG write permission' }),
        status: 400,
      };
    }

    // Put it (seems to not return a response)
    await env.DA_CONFIG.put(key, string);
    // Validate the content is there
    body = await env.DA_CONFIG.get(key);
    status = 201;
  } catch {
    body = JSON.stringify({ error: 'Couldn\'t parse or save config.' });
    status = 400;
  }
  return { body, status };
}

export default async function putKv(req, env, daCtx) {
  try {
    const formData = await req.formData();
    const config = formData.get('config');
    if (config) return save(env, daCtx.fullKey, config);
  } catch {
    // eslint-disable-next-line no-console
    console.log('No form data');
  }
  return { body: JSON.stringify({ error: 'No config or form data.' }), status: 400 };
}
