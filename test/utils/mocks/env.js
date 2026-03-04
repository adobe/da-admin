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
/* eslint-disable no-unused-vars */
const NAMESPACES = {
  'geometrixx-da-props': { 'admin.role.all': ['aparker@geometrixx.info'] },
  'beagle-da-props': { },
  orgs: [
    { name: 'geometrixx' },
    { name: 'beagle' },
  ],
};
const DA_CONFIG = {
  geometrixx: {
    total: 1,
    limit: 1,
    offset: 0,
    data: [
      {
        key: 'admin.role.all',
        value: 'aPaRKer@Geometrixx.Info',
      },
    ],
    ':type': 'sheet',
  },
};

const env = {
  S3_DEF_URL: 'https://s3.com',
  S3_ACCESS_KEY_ID: 'an-id',
  S3_SECRET_ACCESS_KEY: 'too-many-secrets',
  IMS_ORIGIN: 'https://ims-na1.adobelogin.com',
  DA_AUTH: {
    get: (kvNamespace) => NAMESPACES[kvNamespace],
    put: (kvNamespace, value, expObj) => {},
  },
  DA_CONFIG: {
    get: (name) => DA_CONFIG[name],
    put: (name, value, expObj) => {},
  },
};

export default env;
