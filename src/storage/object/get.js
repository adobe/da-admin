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
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import getS3Config from '../utils/config.js';

function buildInput({ bucket, org, key }) {
  const Bucket = bucket;
  return { Bucket, Key: `${org}/${key}` };
}

export default async function getObject(env, { bucket, org, key }, head = false) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const input = buildInput({ bucket, org, key });
  if (!head) {
    try {
      const resp = await client.send(new GetObjectCommand(input));

      /* c8 ignore start */
      if (resp.ContentEncoding === 'gzip') {
        // log to track which documents are gzip encoded and run scripts to fix them
        // eslint-disable-next-line no-console
        console.warn('Content is gzip encoded - request might fail');
        throw new Error('Corrupted content');
      }
      /* c8 ignore end */

      return {
        body: resp.Body,
        status: resp.$metadata.httpStatusCode,
        contentType: resp.ContentType,
        contentLength: resp.ContentLength,
        metadata: {
          ...resp.Metadata,
          LastModified: resp.LastModified,
        },
        etag: resp.ETag,
      };
    } catch (e) {
      return { body: '', status: e.$metadata?.httpStatusCode || 404, contentLength: 0 };
    }
  }
  const url = await getSignedUrl(client, new HeadObjectCommand(input), { expiresIn: 3600 });
  const resp = await fetch(url, { method: 'HEAD' });
  const Metadata = {};
  resp.headers.forEach((value, key2) => {
    if (key2.startsWith('x-amz-meta-')) {
      Metadata[key2.substring('x-amz-meta-'.length)] = value;
    }
  });
  return {
    body: '',
    status: resp.status,
    contentType: resp.headers.get('content-type'),
    contentLength: resp.headers.get('content-length'),
    metadata: {
      ...Metadata,
      LastModified: resp.headers.get('last-modified'),
    },
    etag: resp.headers.get('etag'),
  };
}
