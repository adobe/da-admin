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
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

function loadYaml(relPath) {
  const url = new URL(relPath, import.meta.url);
  return yaml.load(readFileSync(fileURLToPath(url), 'utf8'));
}

describe('OpenAPI source contract', () => {
  it('documents the optional guid field as a UUID on the source schema', () => {
    const schemas = loadYaml('../../docs/openapi/schemas.yaml');
    const guid = schemas?.source?.properties?.guid;
    assert.ok(guid, 'source schema must document a guid property');
    assert.strictEqual(guid.type, 'string');
    assert.strictEqual(guid.format, 'uuid', 'guid must be documented as a UUID');
    assert.match(guid.description, /UUID/, 'guid description must state the UUID constraint');
    assert.match(guid.description, /400/, 'guid description must state the 400 rejection');
    assert.match(guid.description, /409/, 'guid description must state the 409 mismatch response');
  });

  it('describes the guid contract on the PUT and POST source operations', () => {
    const api = loadYaml('../../docs/openapi/source-api.yaml');
    for (const method of ['put', 'post']) {
      const { description } = api.source[method];
      assert.ok(description, `source ${method} must have a description`);
      assert.match(description, /guid/, `source ${method} description must mention guid`);
      assert.match(description, /UUID/, `source ${method} description must state the UUID constraint`);
      assert.match(description, /400/, `source ${method} description must state the 400 rejection`);
      assert.match(description, /409/, `source ${method} description must state the 409 mismatch response`);
    }
  });

  it('keeps 400 and 409 responses on the PUT and POST source operations', () => {
    const api = loadYaml('../../docs/openapi/source-api.yaml');
    for (const method of ['put', 'post']) {
      assert.ok(api.source[method].responses['400'], `source ${method} must document a 400 response`);
      assert.ok(api.source[method].responses['409'], `source ${method} must document a 409 response`);
    }
  });
});
