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

/* eslint-disable no-param-reassign, no-console, class-methods-use-this */
import path from 'path';
import mime from 'mime';
import getDaCtx from '../utils/daCtx.js';
import putObject from '../storage/object/put.js';
import { MediaHandler } from './hlxMediaHandler.js';
import getObject from '../storage/object/get.js';

export class DAMediaHandler extends MediaHandler {
  constructor(config, req, env, daCtx) {
    super({
      ...config,
      disableR2: true,
      contentBusId: 'dummy',
    });
    this.req = req;
    this.env = env;
    this.folder = path.dirname(daCtx.aemPathname);
  }

  _daBlob(blob) {
    const ext = mime.getExtension(blob.contentType) || 'bin';

    const key = `${blob.repo}${path.join(this.folder, `/media_${blob.hash}.${ext}`)}`;
    const uri = `https://admin.da.live/source/${blob.owner}/${key}`;
    blob.uri = uri;
    blob.storageKey = key;
    blob.storageUri = `s3://${this._bucketId}/${key}`;
    return blob;
  }

  async _daUpload(blob) {
    const blobDaCtx = await getDaCtx(this.req, this.env, new URL(blob.uri).pathname);
    const response = await putObject(this.env, blobDaCtx, blob);
    return response && response.status === 201;
  }

  createMediaResource(buffer, contentLength, contentType, sourceUri = '') {
    const blob = this._daBlob(
      super.createMediaResource(buffer, contentLength, contentType, sourceUri),
    );

    return blob;
  }

  async createMediaResourceFromStream(stream, contentLength, contentTypeHint, sourceUri = '') {
    const blob = this._daBlob(
      await super.createMediaResourceFromStream(stream, contentLength, contentTypeHint, sourceUri),
    );

    return blob;
  }

  async getBlob(sourceUri, src) {
    console.log('getBlob', sourceUri, src);
    // TODO
  }

  async checkBlobExists(blob) {
    const blobDaCtx = await getDaCtx(this.req, this.env, new URL(blob.uri).pathname);
    const response = await getObject(this.env, blobDaCtx);
    if (!response) return false;
    return response.status === 200;
  }

  async fetchHeader(uri) {
    console.log('fetchHeader', uri);
    // TODO
  }

  async putMetaData(blob) {
    console.log('putMetaData', blob.uri);
    // TODO
  }

  async upload(blob) {
    return this._daUpload(blob);
  }

  async put(blob) {
    return this._daUpload(blob);
  }

  async spool(blob) {
    return this._daUpload(blob);
  }
}
