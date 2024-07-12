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
import assert from 'node:assert';

import formatList from '../../src/storage/utils/list.js';

const MOCK = {
  delimitedPrefixes: [
    'adobe/blog',
    'adobe/da-aem-boilerplate',
    'adobe/da',
    'adobe/dac',
    'adobe/milo',
    'adobe/dark-alley.jpg',
  ],
  objects: [
    {
      key: 'adobe/blog.props',
    },
    {
      key: 'adobe/da.props',
    },
    {
      key: 'adobe/folder-only.props',
    },
    {
      key: 'adobe/test.html',
    },
    {
      key: 'adobe/dark-alley.jpg.props',
    },
    {
      key: 'adobe/dark-alley.jpg',
    }
  ],
};

const daCtx = { org: 'adobe' };

describe('Format object list', () => {
  const list = formatList(MOCK, daCtx);

  it('should return a true folder / common prefix', () => {
    assert.strictEqual(list[0].name, 'blog');
    assert.strictEqual(list[0].path, '/adobe/blog');
  });

  it('should return a contents-based folder', () => {
    const folderOnly = list.find((item) => { return item.name === 'folder-only' });
    assert.strictEqual(folderOnly.name, 'folder-only');
    assert.strictEqual(folderOnly.path, '/adobe/folder-only');
  });

  it('should not return a props file of same folder name', () => {
    const found = list.reduce((acc, item) => {
      if (item.name === 'blog') acc.push(item);
      return acc;
    },[]);

    assert.strictEqual(found.length, 1);
  });

  it('should not have a filename props file in the list', () => {
    const propsSidecar = list.find((item) => { return item.name === 'dark-alley.jpg.props' });
    assert.strictEqual(propsSidecar, undefined);
  });
});
