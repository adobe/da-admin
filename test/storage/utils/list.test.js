/* eslint-env mocha */
import assert from 'assert';
import sinon from 'sinon';

import getDaCtx from '../../../src/utils/daCtx.js';
import formatList, { listCommand } from '../../../src/storage/utils/list.js';

const MOCK = {
  CommonPrefixes: [
    { Prefix: 'da-aem-boilerplate/' },
    { Prefix: 'blog/' },
    { Prefix: 'da/' },
    { Prefix: 'dac/' },
    { Prefix: 'milo/' },
    { Prefix: 'dark-alley.jpg/' },
  ],
  Contents: [
    {
      Key: 'blog.props',
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'da.props',
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'folder-only.props', 
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'test.html',
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'dark-alley.jpg.props',
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'dark-alley.jpg',
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'empty-folder-with-sibling-file.props',
      LastModified: new Date('2025-01-01'),
    },
    {
      Key: 'empty-folder-with-sibling-file.html',
      LastModified: new Date('2025-01-01'),
    }
  ],
};

const req = new Request('https://example.com/source/adobecom');

const daCtx = getDaCtx(req, {});

describe('Format object list', () => {
  const list = formatList(MOCK, daCtx);

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

  it('should handle empty folders with sibling file names of same name', () => {
    const filtered = list.filter((item) => { return item.name === 'empty-folder-with-sibling-file' });
    assert.strictEqual(filtered.length, 2);
  });

  it('should handle empty CommonPrefixes', () => {
    const emptyMock = { Contents: MOCK.Contents };
    const result = formatList(emptyMock, daCtx);
    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  it('should handle empty Contents', () => {
    const emptyMock = { CommonPrefixes: MOCK.CommonPrefixes };
    const result = formatList(emptyMock, daCtx);
    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  it('should handle both empty CommonPrefixes and Contents', () => {
    const emptyMock = {};
    const result = formatList(emptyMock, daCtx);
    assert(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  it('should filter out extension folders from CommonPrefixes', () => {
    const mockWithExtensionFolder = {
      CommonPrefixes: [
        { Prefix: 'file.jpg/' },
        { Prefix: 'normal-folder/' }
      ]
    };
    const result = formatList(mockWithExtensionFolder, daCtx);
    const extensionFolder = result.find(item => item.name === 'file.jpg');
    assert.strictEqual(extensionFolder, undefined);
    const normalFolder = result.find(item => item.name === 'normal-folder');
    assert(normalFolder);
  });

  it('should handle files with more than 2 dot separators', () => {
    const mockWithComplexFile = {
      Contents: [
        {
          Key: 'file.name.with.multiple.dots',
          LastModified: new Date('2025-01-01'),
        }
      ]
    };
    const result = formatList(mockWithComplexFile, daCtx);
    assert.strictEqual(result.length, 0);
  });

  it('should handle hidden files (starting with dot)', () => {
    const mockWithHiddenFile = {
      Contents: [
        {
          Key: '.hidden-file',
          LastModified: new Date('2025-01-01'),
        }
      ]
    };
    const result = formatList(mockWithHiddenFile, daCtx);
    assert.strictEqual(result.length, 0);
  });

  it('should handle files with props extension correctly', () => {
    const mockWithProps = {
      Contents: [
        {
          Key: 'test.props',
          LastModified: new Date('2025-01-01'),
        }
      ]
    };
    const result = formatList(mockWithProps, daCtx);
    const propsItem = result.find(item => item.name === 'test');
    assert(propsItem);
    assert.strictEqual(propsItem.ext, undefined);
    assert.strictEqual(propsItem.lastModified, undefined);
  });

  it('should not add props file if folder already exists', () => {
    const mockWithBoth = {
      CommonPrefixes: [{ Prefix: 'test/' }],
      Contents: [
        {
          Key: 'test.props',
          LastModified: new Date('2025-01-01'),
        }
      ]
    };
    const result = formatList(mockWithBoth, daCtx);
    const testItems = result.filter(item => item.name === 'test');
    assert.strictEqual(testItems.length, 1);
  });

  it('should sort results alphabetically', () => {
    const mockForSorting = {
      Contents: [
        { Key: 'zebra.html', LastModified: new Date('2025-01-01') },
        { Key: 'alpha.html', LastModified: new Date('2025-01-01') },
        { Key: 'beta.html', LastModified: new Date('2025-01-01') }
      ]
    };
    const result = formatList(mockForSorting, daCtx);
    assert.strictEqual(result[0].name, 'alpha');
    assert.strictEqual(result[1].name, 'beta');
    assert.strictEqual(result[2].name, 'zebra');
  });
});

describe('listCommand', () => {
  let mockS3Client;
  let testDaCtx;

  beforeEach(() => {
    mockS3Client = {
      send: sinon.stub()
    };
    
    // Create a proper daCtx object for testing
    testDaCtx = {
      bucket: 'test-bucket',
      org: 'adobecom',
      key: 'test',
      ext: undefined
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return sourceKeys array when item has extension', async () => {
    const daCtxWithExt = { ...testDaCtx, ext: 'html' };
    const result = await listCommand(daCtxWithExt, {}, mockS3Client);
    
    assert.deepStrictEqual(result, { sourceKeys: [testDaCtx.key] });
    assert.strictEqual(mockS3Client.send.callCount, 0);
  });

  it('should call S3 list command when no extension', async () => {
    const mockResponse = {
      Contents: [
        { Key: 'adobecom/test/file1.html' },
        { Key: 'adobecom/test/file2.html' }
      ],
      NextContinuationToken: 'next-token'
    };
    
    mockS3Client.send.resolves(mockResponse);
    
    const result = await listCommand(testDaCtx, {}, mockS3Client);
    
    assert.strictEqual(mockS3Client.send.callCount, 1);
    assert.deepStrictEqual(result, {
      sourceKeys: [testDaCtx.key, `${testDaCtx.key}.props`, 'test/file1.html', 'test/file2.html'],
      continuationToken: 'next-token'
    });
  });

  it('should handle continuation token', async () => {
    const mockResponse = {
      Contents: [
        { Key: 'adobecom/test/file3.html' }
      ]
    };
    
    mockS3Client.send.resolves(mockResponse);
    
    const details = { continuationToken: 'prev-token' };
    const result = await listCommand(testDaCtx, details, mockS3Client);
    
    assert.strictEqual(mockS3Client.send.callCount, 1);
    const callArgs = mockS3Client.send.firstCall.args[0];
    console.log('Call args:', JSON.stringify(callArgs, null, 2));
    // The command should have the continuation token
    assert.strictEqual(callArgs.input.ContinuationToken, 'prev-token');
    assert.deepStrictEqual(result, {
      sourceKeys: ['test/file3.html'],
      continuationToken: undefined
    });
  });

  it('should handle empty Contents response', async () => {
    const mockResponse = {
      Contents: []
    };
    
    mockS3Client.send.resolves(mockResponse);
    
    const result = await listCommand(testDaCtx, {}, mockS3Client);
    
    assert.deepStrictEqual(result, {
      sourceKeys: [testDaCtx.key, `${testDaCtx.key}.props`],
      continuationToken: undefined
    });
  });

  it('should handle response without NextContinuationToken', async () => {
    const mockResponse = {
      Contents: [
        { Key: 'adobecom/test/file1.html' }
      ]
    };
    
    mockS3Client.send.resolves(mockResponse);
    
    const result = await listCommand(testDaCtx, {}, mockS3Client);
    
    assert.deepStrictEqual(result, {
      sourceKeys: [testDaCtx.key, `${testDaCtx.key}.props`, 'test/file1.html'],
      continuationToken: undefined
    });
  });
});
