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
const NAMESPACES = {
  orgs: [
    {
      name: 'adobe',
      created: '2024-01-09T23:38:05.949Z',
    },
    {
      name: 'geometrixx',
      created: '2023-11-30T06:04:10.008Z',
    },
    {
      name: 'wknd',
      created: '2023-11-30T06:04:10.008Z',
    },
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
        value: 'aparker@geometrixx.info',
      },
    ],
    ':type': 'sheet',
  },
  adobe: {
    total: 1,
    limit: 1,
    offset: 0,
    data: [
      {
        key: 'admin.role.all',
        value: 'notyou@you.com',
      },
    ],
    ':type': 'sheet',
  },
};

const env = {
  DA_AUTH: {
    get: (kvNamespace) => NAMESPACES[kvNamespace],
  },
  DA_CONFIG: {
    get: (name) => {
      const nameConfig = DA_CONFIG[name];
      console.log(nameConfig);
      return nameConfig;
    },
  },
};

export default env;
