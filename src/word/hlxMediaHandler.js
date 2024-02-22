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
import mime from 'mime';
import { createHash } from 'sha1-uint8array';

import sizeOf from 'image-size';

sizeOf.disableFS(true);

// cache external urls
const blobCache = {};

/* Partial copy/reimplementation of https://github.com/adobe/helix-mediahandler/blob/main/src/MediaHandler.js
 * due to wrangler limitations with using native node modules (e.g. crypto, Buffer, http2, etc.).
 * TODO: it would be nice to have a way to use the original MediaHandler.js
 */
export class MediaHandler {
  constructor(opts = {}) {
    Object.assign(this, {
      _bucketId: opts.bucketId || 'helix-media-bus',
      _contentBusId: opts.contentBusId,
      _owner: opts.owner,
      _repo: opts.repo,
      _ref: opts.ref,

      _log: opts.log || console,
      _noCache: opts.noCache,
      _uploadBufferSize: opts.uploadBufferSize || 1024 * 1024 * 5,

      // estimated bandwidth for copying blobs (should be dynamically adapted).
      _bandwidth: 1024 * 1024, // bytes/s

      // start time of the action
      _startTime: Date.now(),

      // maximum time allowed (the default timeout we allow in pipeline is 20s. be conservative)
      _maxTime: opts.maxTime || 10 * 1000,

      // list of uploads (scheduled and completed)
      _uploads: [],

      // blob filter
      _filter: opts.filter || (() => true),

      // authentication header for sources
      _auth: opts.auth || null,

      // resource name prefix
      _namePrefix: opts.namePrefix || '',

      _blobAgent: opts.blobAgent || 'da-media-handler',
    });

    if (!this._owner || !this._repo || !this._ref || !this._contentBusId) {
      throw Error('owner, repo, ref, and contentBusId are mandatory parameters.');
    }

    this._cache = blobCache[this._contentBusId];
    if (!this._cache) {
      blobCache[this._contentBusId] = {};
      this._cache = blobCache[this._contentBusId];
    }
  }

  static updateBlobURI(blob) {
    const {
      owner,
      repo,
      ref,
      hash,
    } = blob;
    const ext = mime.getExtension(blob.contentType) || 'bin';
    let fragment = '';
    if (blob.meta && blob.meta.width && blob.meta.height && !blob.contentType?.match(/^video\/[^/]+$/)) {
      fragment = `#width=${blob.meta.width}&height=${blob.meta.height}`;
    }
    // eslint-disable-next-line no-param-reassign
    blob.uri = `https://${ref}--${repo}--${owner}.hlx.page/media_${hash}.${ext}${fragment}`;
    return blob;
  }

  _getDimensions(data, c) {
    if (!data) {
      return {};
    }

    try {
      const dimensions = sizeOf(data);
      this._log.info(`[${c}] detected dimensions: ${dimensions.type} ${dimensions.width} x ${dimensions.height}`);
      return {
        width: String(dimensions.width),
        height: String(dimensions.height),
        type: mime.getType(dimensions.type),
      };
    } catch (e) {
      this._log.warn(`[${c}] error detecting dimensions: ${e}`);
      return {};
    }
  }

  _initMediaResource(buffer, contentLength) {
    // compute hashes
    let hashBuffer = buffer;
    if (hashBuffer.length > 8192) {
      hashBuffer = hashBuffer.slice(0, 8192);
    }

    // crypto is not supported in wrangler, added polyfill
    const crypto = { createHash };
    const contentHash = crypto.createHash('sha1')
      .update(String(contentLength))
      .update(hashBuffer)
      .digest('hex');
    const hash = `1${contentHash}`;
    const storageKey = `${this._contentBusId}/${this._namePrefix}${hash}`;

    return MediaHandler.updateBlobURI({
      storageUri: `s3://${this._bucketId}/${storageKey}`,
      storageKey,
      owner: this._owner,
      repo: this._repo,
      ref: this._ref,
      contentBusId: this._contentBusId,
      contentLength,
      hash,
    });
  }

  /**
   * Creates an external resource from the given buffer and properties.
   * @param {Buffer} buffer - buffer with data
   * @param {number} [contentLength] - Size of blob.
   * @param {string} [contentType] - content type
   * @param {string} [sourceUri] - source uri
   * @returns {MediaResource} the external resource object.
   */
  createMediaResource(buffer, contentLength, contentType, sourceUri = '') {
    if (!contentLength) {
      // eslint-disable-next-line no-param-reassign
      contentLength = buffer.length;
    }

    // compute hash
    const resource = this._initMediaResource(buffer, contentLength);

    // try to detect dimensions
    const { type, ...dims } = this._getDimensions(buffer, '');

    return MediaHandler.updateBlobURI({
      sourceUri,
      data: buffer.length === contentLength ? buffer : null,
      contentType: MediaHandler.getContentType(type, contentType, sourceUri),
      ...resource,
      meta: {
        alg: '8k',
        agent: this._blobAgent,
        src: sourceUri,
        ...dims,
      },
    });
  }

  async createMediaResourceFromStream(stream, contentLength, contentType, sourceUri = '') {
    if (!contentLength) {
      throw Error('createExternalResourceFromStream() needs contentLength');
    }

    const fullBuffer = await new Promise((resolve, reject) => {
      const chunks = [];

      const done = () => {
        // eslint-disable-next-line no-use-before-define
        stream.removeListener('readable', onReadable);
        // eslint-disable-next-line no-use-before-define
        stream.removeListener('end', onEnd);
        const buf = Buffer.concat(chunks);
        resolve(buf);
      };
      /* c8 ignore next 3 */
      const onEnd = () => {
        done();
      };
      const onReadable = () => {
        let chunk;
        // eslint-disable-next-line yoda, no-cond-assign
        while (null !== (chunk = stream.read())) {
          chunks.push(chunk);
        }
      };

      stream.on('readable', onReadable);
      stream.on('end', onEnd);
      stream.on('error', (e) => {
        reject(Error(`Error reading stream: ${e.code}`));
      });
    });

    return this.createMediaResource(fullBuffer, contentLength, contentType, sourceUri);
  }

  /**
   * Returns the best content type. Prioritizes the detected content type over the hinted one over
   * the one derived from the uri. By also favoring non application/octet-stream ones.
   */
  static getContentType(detectedType, hintedType, uri) {
    const uriType = mime.getType(uri);
    // get first non octet stream type
    for (const type of [detectedType, hintedType, uriType]) {
      if (type && type !== 'application/octet-stream') {
        return type;
      }
    }
    return 'application/octet-stream';
  }
}
