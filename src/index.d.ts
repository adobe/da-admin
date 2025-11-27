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
import { KVNamespace, R2Bucket, Fetcher } from "@cloudflare/workers-types";

export interface Env {
  S3_DEF_URL: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  IMS_ORIGIN: string;
  AEM_BUCKET_NAME: string;
  // shared secret used as authorization when invoking the collab service (eg for syncadmin)
  COLLAB_SHARED_SECRET: string;

  DA_AUTH: KVNamespace,
  DA_CONFIG: KVNamespace,
  DA_JOBS: KVNamespace,
  AEM_CONTENT: R2Bucket;

  dacollab: Fetcher;
}
