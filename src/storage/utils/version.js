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
} from '@aws-sdk/client-s3';

export function createBucketIfMissing(client) {
  client.middlewareStack.add(
    (next) => async (args) => {
      // eslint-disable-next-line no-param-reassign
      args.request.headers['cf-create-bucket-if-missing'] = 'true';
      return next(args);
    },
    {
      step: 'build',
      name: 'createIfMissingMiddleware',
      tags: ['METADATA', 'CREATE-BUCKET-IF-MISSING'],
    },
  );
  return client;
}

export function ifNoneMatch(config) {
  const client = new S3Client(config);
  createBucketIfMissing(client);
  client.middlewareStack.add(
    (next) => async (args) => {
      // eslint-disable-next-line no-param-reassign
      args.request.headers['If-None-Match'] = '*';
      return next(args);
    },
    {
      step: 'build',
      name: 'ifNoneMatchMiddleware',
      tags: ['METADATA', 'IF-NONE-MATCH'],
    },
  );
  return client;
}

export function ifMatch(config, match) {
  const client = new S3Client(config);
  createBucketIfMissing(client);
  client.middlewareStack.add(
    (next) => async (args) => {
      // eslint-disable-next-line no-param-reassign
      args.request.headers['If-Match'] = match;
      return next(args);
    },
    {
      step: 'build',
      name: 'ifMatchMiddleware',
      tags: ['METADATA', 'IF-MATCH'],
    },
  );
  return client;
}
