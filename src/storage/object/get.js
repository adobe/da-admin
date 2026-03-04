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
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import getS3Config from '../utils/config.js';
import { ifMatch, ifNoneMatch } from '../utils/version.js';

function buildInput({ bucket, org, key }) {
  const Bucket = bucket;
  return { Bucket, Key: `${org}/${key}` };
}

export default async function getObject(
  env,
  { bucket, org, key },
  head = false,
  conditionalHeaders = null,
) {
  const config = getS3Config(env);

  // Validate conflicting conditionals - per RFC 7232, If-None-Match takes precedence for GET/HEAD
  if (conditionalHeaders?.ifMatch && conditionalHeaders?.ifNoneMatch) {
    // Both headers present - use If-None-Match for GET/HEAD per RFC 7232 Section 3.2
    // eslint-disable-next-line no-console
    console.warn('Both If-Match and If-None-Match provided, using If-None-Match per RFC 7232');
  }

  const input = buildInput({ bucket, org, key });
  if (!head) {
    // Apply conditional headers middleware for GET requests
    let client;
    if (conditionalHeaders?.ifNoneMatch) {
      client = ifNoneMatch(config, conditionalHeaders.ifNoneMatch);
    } else if (conditionalHeaders?.ifMatch) {
      client = ifMatch(config, conditionalHeaders.ifMatch);
    } else {
      client = new S3Client(config);
    }
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
      if (!e.$metadata?.httpStatusCode) {
        // eslint-disable-next-line no-console
        console.error('Error getting object without httpStatusCode', e);
      }
      // Handle conditional request failures (304 Not Modified, 412 Precondition Failed)
      const status = e.$metadata?.httpStatusCode || 500;
      if (status === 304 || status === 412) {
        // Include ETag in 304/412 responses per RFC 7232
        return {
          body: '',
          status,
          contentLength: 0,
          etag: e.ETag || conditionalHeaders?.ifNoneMatch,
        };
      }
      return { body: '', status, contentLength: 0 };
    }
  }
  // HEAD request path - uses presigned URL with fetch
  const client = new S3Client(config);
  try {
    const url = await getSignedUrl(client, new HeadObjectCommand(input), { expiresIn: 3600 });
    const fetchHeaders = {};

    // Add conditional headers to fetch request
    if (conditionalHeaders?.ifNoneMatch) {
      fetchHeaders['If-None-Match'] = conditionalHeaders.ifNoneMatch;
    } else if (conditionalHeaders?.ifMatch) {
      fetchHeaders['If-Match'] = conditionalHeaders.ifMatch;
    }

    const resp = await fetch(url, { method: 'HEAD', headers: fetchHeaders });

    // Handle conditional request failures
    if (resp.status === 304 || resp.status === 412) {
      return {
        body: '',
        status: resp.status,
        contentLength: 0,
        etag: resp.headers.get('etag'),
      };
    }

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
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error in HEAD request', e);
    const status = e.$metadata?.httpStatusCode || 500;
    if (status === 304 || status === 412) {
      return { body: '', status, contentLength: 0 };
    }
    return { body: '', status, contentLength: 0 };
  }
}
