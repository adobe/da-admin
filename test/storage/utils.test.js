/* eslint-env mocha */
import assert from 'assert';

import formatList, { formatPaginatedList } from '../../src/storage/utils/list.js';

import { describe, it } from 'vitest';

function getMock() {
  return {
    CommonPrefixes: [
      { Prefix: 'blog/' },
      { Prefix: 'da-aem-boilerplate/' },
      { Prefix: 'da/' },
      { Prefix: 'dac/' },
      { Prefix: 'milo/' },
      { Prefix: 'dark-alley.jpg/' },
    ],
    Contents: [
      {
        Key: 'blog.props',
        LastModified: new Date(),
      },
      {
        Key: 'da.props',
        LastModified: new Date(),
      },
      {
        Key: 'folder-only.props',
        LastModified: new Date(),
      },
      {
        Key: 'test.html',
        LastModified: new Date(),
      },
      {
        Key: 'dark-alley.jpg.props',
        LastModified: new Date(),
      },
      {
        Key: 'dark-alley.jpg',
        LastModified: new Date(),
      }
    ],
  };
}

const daCtx = { url: 'https://admin.da.live/list/foo/bar' };

describe('Format object list', () => {
  const list = formatList(getMock(), daCtx);

  it('should return a true folder / common prefix', () => {
    assert.strictEqual(list[0].name, 'blog');
  });

  it('should return a contents-based folder', () => {
    const folderOnly = list.find((item) => { return item.name === 'folder-only' });
    assert.strictEqual(folderOnly.name, 'folder-only');
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

describe('format paginated object list', () => {
  const list = formatPaginatedList(getMock(), daCtx);

  it('should return a true folder / common prefix', () => {
    assert.strictEqual(list[0].name, 'blog');
  });

  it('should return a contents-based folder', () => {
    const folderOnly = list.find((item) => { return item.name === 'folder-only' });
    assert.strictEqual(folderOnly.name, 'folder-only');
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
