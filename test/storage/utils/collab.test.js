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
import { deleteFromCollab, syncCollab } from '../../../src/storage/utils/collab.js';
import assert from 'node:assert';

const DA_CTX = {
  origin: 'http://localhost:9876',
  api: 'source',
  org: 'geometrixx',
};


describe('collab invalidation', () => {
  describe('no op cases', () => {
    it('does not invalidate collab if initiator is collab', async () => {
      const daCtx = {
        key: 'somedoc.html',
        initiator: 'collab',
        ...DA_CTX,
      };

      const env = {
        dacollab: {
          fetch: async () => {
            assert.fail('should not call fetch');
          }
        }
      };
      await deleteFromCollab(env, daCtx);
    });
    it('collab if file is not html', async () => {
      const daCtx = {
        key: 'somedoc.props',
        ...DA_CTX,
      };
      const env = {
        dacollab: {
          fetch: async () => {
            assert.fail('should not call fetch');
          }
        }
      };
      await deleteFromCollab(env, daCtx);
    });
  });

  describe('delete action', () => {
    it('deletes from collab', async () => {
      const daCtx = {
        key: 'somedoc.html',
        ...DA_CTX,
      };
      const env = {
        dacollab: {
          fetch: async (url) => {
            assert.strictEqual(url, 'https://localhost/api/v1/deleteadmin?doc=http://localhost:9876/source/geometrixx/somedoc.html');
          }
        }
      };
      await deleteFromCollab(env, daCtx);
    });
  });

  describe('sync action', () => {
    it('syncs collab', async () => {
      const daCtx = {
        key: 'somedoc.html',
        ...DA_CTX,
      };
      const env = {
        dacollab: {
          fetch: async (url) => {
            assert.strictEqual(url, 'https://localhost/api/v1/syncadmin?doc=http://localhost:9876/source/geometrixx/somedoc.html');
          }
        }
      };
      await syncCollab(env, daCtx);
    });
  });
});
