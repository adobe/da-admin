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
import { strict as esmock } from 'esmock';

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import env from '../../utils/mocks/env.js';

import { putObjectWithVersion, postObjectVersion } from './mocks/version/put.js';

const s3Mock = mockClient(S3Client);
const putObject = await esmock('../../../src/storage/object/put.js', {
  '../../../src/storage/version/put.js': {
    putObjectWithVersion,
    postObjectVersion,
  },
});

describe('Object storage', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('Put success', async () => {
    it('Successfully puts text data', async () => {
      const daCtx = {
        org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props',
      };
      const obj = { data: '<html></html>', guid: '8888' };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, '8888');
    });

    it('Successfully puts file data', async () => {
      const daCtx = {
        org: 'adobe', site: 'geometrixx', isFile: true, key: 'geometrixx/foo.html', pathname: '/foo', propsKey: 'geometrixx/foo.html.props',
      };
      const data = new File(['foo'], 'foo.txt', { type: 'text/plain' });
      const obj = { data };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(JSON.parse(resp.body).source.editUrl, 'https://da.live/edit#/adobe/foo');
    });

    it('Successfully puts no data', async () => {
      const daCtx = {
        org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props',
      };
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

    it('Creates version for PDF document upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-pdf-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a mock PDF file (PDF signature: %PDF)
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const pdfFile = new File([pdfData], 'document.pdf', { type: 'application/pdf' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'documents/report.pdf',
        pathname: '/documents/report',
        propsKey: 'documents/report.pdf.props',
        ext: 'pdf'
      };

      const obj = { data: pdfFile, guid: 'pdf-guid-abc' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-pdf-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'application/pdf');
      assert.strictEqual(versionCalls[0].guid, 'pdf-guid-abc');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for ZIP archive upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-zip-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a mock ZIP file (ZIP signature: PK)
      const zipData = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const zipFile = new File([zipData], 'archive.zip', { type: 'application/zip' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'downloads/archive.zip',
        pathname: '/downloads/archive',
        propsKey: 'downloads/archive.zip.props',
        ext: 'zip'
      };

      const obj = { data: zipFile, guid: 'zip-guid-def' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-zip-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'application/zip');
      assert.strictEqual(versionCalls[0].guid, 'zip-guid-def');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for generic binary file upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-binary-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a generic binary file with application/octet-stream (fallback content type)
      const binaryData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE]);
      const binaryFile = new File([binaryData], 'data.bin', { type: 'application/octet-stream' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'files/data.bin',
        pathname: '/files/data',
        propsKey: 'files/data.bin.props',
        ext: 'bin'
      };

      const obj = { data: binaryFile, guid: 'binary-guid-ghi' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-binary-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'application/octet-stream');
      assert.strictEqual(versionCalls[0].guid, 'binary-guid-ghi');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for audio file upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-audio-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a mock MP3 file (ID3v2 signature)
      const mp3Data = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
      const mp3File = new File([mp3Data], 'audio.mp3', { type: 'audio/mpeg' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'media/audio.mp3',
        pathname: '/media/audio',
        propsKey: 'media/audio.mp3.props',
        ext: 'mp3'
      };

      const obj = { data: mp3File, guid: 'audio-guid-jkl' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-audio-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'audio/mpeg');
      assert.strictEqual(versionCalls[0].guid, 'audio-guid-jkl');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for HTML file upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-html-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create an HTML file with typical content
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
</head>
<body>
  <h1>Welcome to DA</h1>
  <p>This is a test HTML document for versioning.</p>
</body>
</html>`;
      const htmlFile = new File([htmlContent], 'index.html', { type: 'text/html' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'pages/index.html',
        pathname: '/pages/index',
        propsKey: 'pages/index.html.props',
        ext: 'html'
      };

      const obj = { data: htmlFile, guid: 'html-guid-mno' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-html-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'text/html');
      assert.strictEqual(versionCalls[0].guid, 'html-guid-mno');
      assert(versionCalls[0].update.body instanceof File);
    });

    it('Creates version for JSON file upload', async () => {
      const versionCalls = [];
      const mockPutObjectWithVersion = async (e, daCtx, update, body, guid) => {
        versionCalls.push({ e, daCtx, update, body, guid });
        return { status: 201, metadata: { id: 'test-json-id' } };
      };

      const putObjectWithVersioning = await esmock('../../../src/storage/object/put.js', {
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
          postObjectVersion,
        }
      });

      // Create a JSON file with typical structured data
      const jsonContent = JSON.stringify({
        title: 'Test Configuration',
        version: '1.0.0',
        settings: {
          enabled: true,
          options: ['option1', 'option2', 'option3']
        },
        metadata: {
          author: 'test@example.com',
          created: '2024-01-01T00:00:00Z'
        }
      }, null, 2);
      const jsonFile = new File([jsonContent], 'config.json', { type: 'application/json' });

      const daCtx = {
        org: 'testorg',
        site: 'testsite',
        isFile: true,
        key: 'config/settings.json',
        pathname: '/config/settings',
        propsKey: 'config/settings.json.props',
        ext: 'json'
      };

      const obj = { data: jsonFile, guid: 'json-guid-pqr' };
      const resp = await putObjectWithVersioning(env, daCtx, obj);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, 'test-json-id');
      assert.strictEqual(versionCalls.length, 1);
      assert.strictEqual(versionCalls[0].update.type, 'application/json');
      assert.strictEqual(versionCalls[0].guid, 'json-guid-pqr');
      assert(versionCalls[0].update.body instanceof File);
    });
  });
});
