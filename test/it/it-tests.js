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

// eslint-disable-next-line func-names
export default (ctx) => describe('Integration Tests: it tests', function () {
  // Enable bail to stop on first failure - tests are interdependent
  this.bail(true);

  it('should set org config via HTTP request', async function shouldSetOrgConfig() {
    if (!ctx.local) {
      // in stage, the config is already set and we should not overwrite it
      // to preserve the setup and be able to access the content
      this.skip();
    }
    const {
      serverUrl, org, accessToken,
    } = ctx;
    const configData = JSON.stringify({
      total: 2,
      limit: 2,
      offset: 0,
      data: [
        { path: 'CONFIG', groups: 'test@example.com', actions: 'write' },
        { path: '/+**', groups: 'test@example.com', actions: 'write' },
      ],
      ':type': 'sheet',
      ':sheetname': 'permissions',
    });

    const formData = new FormData();
    formData.append('config', configData);

    const url = `${serverUrl}/config/${org}`;
    const resp = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status}`);
  });

  it('should get org config via HTTP request', async () => {
    const {
      serverUrl, org, accessToken, email,
    } = ctx;
    const url = `${serverUrl}/config/${org}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.json();
    assert.strictEqual(body.total, 2, `Expected 2, got ${body.total}`);
    assert.strictEqual(body.data[0].path, 'CONFIG', `Expected CONFIG, got ${body.data[0].path}`);
    assert.strictEqual(body.data[0].groups, email, `Expected user email, got ${body.data[0].groups}`);
    assert.strictEqual(body.data[0].actions, 'write', `Expected write, got ${body.data[0].actions}`);
    assert.strictEqual(body.data[1].path, '/+**', `Expected /+**, got ${body.data[1].path}`);
    assert.strictEqual(body.data[1].groups, email, `Expected user email, got ${body.data[1].groups}`);
    assert.strictEqual(body.data[1].actions, 'write', `Expected write, got ${body.data[1].actions}`);
  });

  it('not allowed to read if not authenticated', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'GET',
    });
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('cannot delete root folder if not authenticated', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('cannot delete root folder if not authenticated', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('delete root folder to cleanup the bucket', async () => {
    const {
      serverUrl, org, repo, accessToken,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status}`);

    // validate bucket is empty
    const listResp = await fetch(`${serverUrl}/list/${org}/${repo}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(listResp.status, 200, `Expected 200 OK, got ${listResp.status}`);
    const listBody = await listResp.json();
    assert.strictEqual(listBody.length, 0, `Expected 0 items, got ${listBody.length}`);
  });

  it('should create a repo via HTTP request', async () => {
    const {
      serverUrl, org, repo, accessToken,
    } = ctx;
    const formData = new FormData();
    const blob = new Blob(['{}'], { type: 'application/json' });
    const file = new File([blob], `${repo}.props`, { type: 'application/json' });
    formData.append('data', file);

    const resp = await fetch(`${serverUrl}/source/${org}/${repo}/${repo}.props`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201 for marker, got ${resp.status}`);
  });

  it('cannot post an object via HTTP request if not authenticated', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    // Now create the actual page
    const key = 'test-folder/page1';
    const ext = '.html';

    // Create FormData with the HTML file
    const formData = new FormData();
    const blob = new Blob(['<html><body><h1>Page 1</h1></body></html>'], { type: 'text/html' });
    const file = new File([blob], 'page1.html', { type: 'text/html' });
    formData.append('data', file);

    const url = `${serverUrl}/source/${org}/${repo}/${key}${ext}`;
    const resp = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('should post an object via HTTP request', async () => {
    const {
      serverUrl, org, repo, accessToken,
    } = ctx;
    // Now create the actual page
    const key = 'test-folder/page1';
    const ext = '.html';

    // Create FormData with the HTML file
    const formData = new FormData();
    const blob = new Blob(['<html><body><h1>Page 1</h1></body></html>'], { type: 'text/html' });
    const file = new File([blob], 'page1.html', { type: 'text/html' });
    formData.append('data', file);

    const url = `${serverUrl}/source/${org}/${repo}/${key}${ext}`;
    let resp = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status}`);

    let body = await resp.json();
    assert.strictEqual(body.source.editUrl, `https://da.live/edit#/${org}/${repo}/${key}`);
    assert.strictEqual(body.source.contentUrl, `https://content.da.live/${org}/${repo}/${key}`);
    assert.strictEqual(body.aem.previewUrl, `https://main--${repo}--${org}.aem.page/${key}`);
    assert.strictEqual(body.aem.liveUrl, `https://main--${repo}--${org}.aem.live/${key}`);

    // validate page is here (include extension in GET request)
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/${key}${ext}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    body = await resp.text();
    assert.strictEqual(body, '<html><body><h1>Page 1</h1></body></html>');

    // create another page
    const key2 = 'test-folder/page2';
    const ext2 = '.html';
    const formData2 = new FormData();
    const htmlBlob2 = new Blob(['<html><body><h1>Page 2</h1></body></html>'], { type: 'text/html' });
    const htmlFile2 = new File([htmlBlob2], 'page2.html', { type: 'text/html' });
    formData2.append('data', htmlFile2);
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/${key2}${ext2}`, {
      method: 'POST',
      body: formData2,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status}`);
  });

  it('cannot list objects via HTTP request if not authenticated', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    const url = `${serverUrl}/list/${org}/${repo}`;
    const resp = await fetch(url);
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('should list objects via HTTP request', async () => {
    const {
      serverUrl, org, repo, accessToken,
    } = ctx;
    const key = 'test-folder';

    const url = `${serverUrl}/list/${org}/${repo}/${key}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.json();

    const fileNames = body.map((item) => item.name);
    assert.ok(fileNames.includes('page1'), 'Should list page1');
    assert.ok(fileNames.includes('page2'), 'Should list page2');
  });

  it('cannot list repos via HTTP request if not authenticated', async () => {
    const {
      serverUrl, org,
    } = ctx;
    const url = `${serverUrl}/list/${org}`;
    const resp = await fetch(url);
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('should list repos via HTTP request', async () => {
    const {
      serverUrl, org, repo, accessToken,
    } = ctx;
    const url = `${serverUrl}/list/${org}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.json();
    assert.ok(body.length > 0, `Expected at least 1 repo, got ${body.length}`);
    // need to find the current repo in the list
    const repoItem = body.find((item) => item.name === repo);
    assert.ok(repoItem, `Expected ${repo} to be in the list`);
  });

  it('cannot delete an object via HTTP request if not authenticated', async () => {
    const {
      serverUrl, org, repo, key,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/${key}`;
    const resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('should delete an object via HTTP request', async () => {
    const {
      serverUrl, org, repo, accessToken,
    } = ctx;
    const key = 'test-folder/page2';
    const ext = '.html';

    const url = `${serverUrl}/source/${org}/${repo}/${key}${ext}`;
    let resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status}`);

    // validate page is not here
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/${key}${ext}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(resp.status, 404, `Expected 404 Not Found, got ${resp.status}`);
  });

  it('should logout via HTTP request', async () => {
    const { serverUrl, accessToken } = ctx;
    const url = `${serverUrl}/logout`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);
  });
});
