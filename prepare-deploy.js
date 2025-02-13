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
/* eslint-disable no-underscore-dangle */

import { dirname, resolve } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  let toml = await readFile(resolve(__dirname, 'wrangler.toml'), 'utf-8');
  const { version } = JSON.parse(await readFile(resolve(__dirname, 'package.json')));
  toml = toml.replaceAll('@@VERSION@@', version);
  await writeFile(resolve(__dirname, 'wrangler-versioned.toml'), toml, 'utf-8');
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
}
