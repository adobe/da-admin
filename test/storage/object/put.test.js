import assert from 'assert';
import { strict as esmock } from 'esmock';

import env from '../../utils/mocks/env.js';

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';

const s3Mock = mockClient(S3Client);

import { putObjectWithVersion, postObjectVersion } from './mocks/version/put.js';
const putObject = await esmock('../../../src/storage/object/put.js', {
  '../../../src/storage/version/put.js': {
    putObjectWithVersion,
    postObjectVersion,
  }
});

describe('Object storage', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('Put success', async () => {
    it('Successfully puts text data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props' };
      const obj = { data: '<html></html>', guid: '8888' };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, '8888');
    });

    it('Successfully puts file data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', isFile: true, key: 'geometrixx/foo.html', pathname: '/foo', propsKey: 'geometrixx/foo.html.props' };
      const data = new File(['foo'], 'foo.txt', { type: 'text/plain' });
      const obj = { data };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(JSON.parse(resp.body).source.editUrl, 'https://da.live/edit#/adobe/foo')
    });

    it('Successfully puts no data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props' };
      const resp = await putObject(env, daCtx);
      assert.strictEqual(resp.status, 201);
    });
  });

  describe('Binary file versioning', () => {
    it('Creates version for JPEG image upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-jpeg-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a mock JPEG file (using a simple byte array to simulate binary data)
      const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      const jpegFile = new File([jpegData], 'test-image.jpg', { type: 'image/jpeg' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'images/test-image.jpg',
        pathname: '/images/test-image',
        propsKey: 'images/test-image.jpg.props',
        ext: 'jpg'
      };

      const obj = { data: jpegFile, guid: 'jpeg-guid-123' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-jpeg-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'image/jpeg');
      assert.strictEqual(versionCalls[0].guid, 'jpeg-guid-123');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for PNG image upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-png-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a mock PNG file (PNG signature)
      const pngData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const pngFile = new File([pngData], 'test-image.png', { type: 'image/png' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'images/test-image.png',
        pathname: '/images/test-image',
        propsKey: 'images/test-image.png.props',
        ext: 'png'
      };

      const obj = { data: pngFile };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-png-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'image/png');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for MP4 video upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-video-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a mock MP4 file (ftyp box signature)
      const mp4Data = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
      const mp4File = new File([mp4Data], 'test-video.mp4', { type: 'video/mp4' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'videos/test-video.mp4',
        pathname: '/videos/test-video',
        propsKey: 'videos/test-video.mp4.props',
        ext: 'mp4'
      };

      const obj = { data: mp4File, guid: 'video-guid-456' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-video-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'video/mp4');
      assert.strictEqual(versionCalls[0].guid, 'video-guid-456');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for SVG image upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-svg-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create an SVG file (text-based but still an image)
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>';
      const svgFile = new File([svgContent], 'test-image.svg', { type: 'image/svg+xml' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'images/test-image.svg',
        pathname: '/images/test-image',
        propsKey: 'images/test-image.svg.props',
        ext: 'svg'
      };

      const obj = { data: svgFile, guid: 'svg-guid-789' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-svg-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'image/svg+xml');
      assert.strictEqual(versionCalls[0].guid, 'svg-guid-789');
      assert(versionCalls[0].update.body instanceof File);
    });
  });
});
