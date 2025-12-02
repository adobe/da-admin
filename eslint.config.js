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
import globals from 'globals';
import { defineConfig, globalIgnores } from '@eslint/config-helpers'
import { recommended, source, test } from '@adobe/eslint-config-helix';

export default defineConfig([
  globalIgnores([
    'coverage',
    'dist/*',
    '.wrangler',
  ]),
  {
    languageOptions: {
      ...recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
        ...globals.es6,
        __rootdir: true,
      },
    },
    rules: {
      // 'import/extensions': [2, 'ignorePackages'],
      'import/prefer-default-export': 0,

      // console.log is the only means of logging in a cloudflare worker
      'no-console': 'off',

      // We have quite a lot of use cases where assignment to function
      // parameters is definitely desirable
      'no-param-reassign': 'off',

      // Allow while (true) infinite loops
      // 'no-constant-condition': ['error', { checkLoops: false }],

      // Quite useful to mark values as unused
      // 'no-underscore-dangle': 'off',    },
    },
    plugins: {
      import: recommended.plugins.import,
    },
    extends: [recommended],
  },
  source,
  test,
]);
