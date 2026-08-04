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

import { getUsersForMetadata } from '../../../src/storage/utils/version.js';

describe('getUsersForMetadata', () => {
  it('returns undefined when users is missing', () => {
    assert.equal(getUsersForMetadata(undefined), undefined);
  });

  it('projects to email only, dropping ident/orgs', () => {
    const users = [{ email: 'jane@example.com', ident: '123', orgs: [{}] }];
    assert.deepStrictEqual(getUsersForMetadata(users), [{ email: 'jane@example.com' }]);
  });

  it('keeps the email clean and adds isAgentic when the user is an agent', () => {
    const users = [{ email: 'jane@example.com', ident: '123', isAgentic: true }];
    assert.deepStrictEqual(
      getUsersForMetadata(users),
      [{ email: 'jane@example.com', isAgentic: true }],
    );
  });

  it('flags only the agent users in a mixed list', () => {
    const users = [
      { email: 'jane@example.com', isAgentic: true },
      { email: 'bob@example.com' },
    ];
    assert.deepStrictEqual(getUsersForMetadata(users), [
      { email: 'jane@example.com', isAgentic: true },
      { email: 'bob@example.com' },
    ]);
  });
});
