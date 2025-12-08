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
export default (SERVER_URL, ORG, REPO) => describe('Integration Tests: it tests', function () {
  // Enable bail to stop on first failure - tests are interdependent
  this.bail(true);

  it('delete root folder should cleanup the bucket', async () => {
    const url = `${SERVER_URL}/source/${ORG}/${REPO}`;
    const resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status}`);

    // validate bucket is empty
    const listResp = await fetch(`${SERVER_URL}/list/${ORG}/${REPO}`);
    assert.strictEqual(listResp.status, 200, `Expected 200 OK, got ${listResp.status}`);
    const listBody = await listResp.json();
    assert.strictEqual(listBody.length, 0, `Expected 0 items, got ${listBody.length}`);
  });

  it('should create a repo via HTTP request', async () => {
    const formData = new FormData();
    const blob = new Blob(['{}'], { type: 'application/json' });
    const file = new File([blob], `${REPO}.props`, { type: 'application/json' });
    formData.append('data', file);

    const resp = await fetch(`${SERVER_URL}/source/${ORG}/${REPO}/${REPO}.props`, {
      method: 'POST',
      body: formData,
    });
    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201 for marker, got ${resp.status}`);
  });

  it('should post an object via HTTP request', async () => {
    // Now create the actual page
    const key = 'test-folder/page1';
    const ext = '.html';

    // Create FormData with the HTML file
    const formData = new FormData();
    const blob = new Blob(['<html><body><h1>Page 1</h1></body></html>'], { type: 'text/html' });
    const file = new File([blob], 'page1.html', { type: 'text/html' });
    formData.append('data', file);

    const url = `${SERVER_URL}/source/${ORG}/${REPO}/${key}${ext}`;
    let resp = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status}`);

    let body = await resp.json();
    assert.strictEqual(body.source.editUrl, `https://da.live/edit#/${ORG}/${REPO}/${key}`);
    assert.strictEqual(body.source.contentUrl, `https://content.da.live/${ORG}/${REPO}/${key}`);
    assert.strictEqual(body.aem.previewUrl, `https://main--${REPO}--${ORG}.aem.page/${key}`);
    assert.strictEqual(body.aem.liveUrl, `https://main--${REPO}--${ORG}.aem.live/${key}`);

    // validate page is here (include extension in GET request)
    resp = await fetch(`${SERVER_URL}/source/${ORG}/${REPO}/${key}${ext}`);

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
    resp = await fetch(`${SERVER_URL}/source/${ORG}/${REPO}/${key2}${ext2}`, {
      method: 'POST',
      body: formData2,
    });
    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status}`);
  });

  it('should list objects via HTTP request', async () => {
    const key = 'test-folder';

    const url = `${SERVER_URL}/list/${ORG}/${REPO}/${key}`;
    const resp = await fetch(url);

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.json();

    const fileNames = body.map((item) => item.name);
    assert.ok(fileNames.includes('page1'), 'Should list page1');
    assert.ok(fileNames.includes('page2'), 'Should list page2');
  });

  it('should list repos via HTTP request', async () => {
    const url = `${SERVER_URL}/list/${ORG}`;
    const resp = await fetch(url);

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.json();
    assert.strictEqual(body.length, 1, `Expected 1 repo, got ${body.length}`);
    assert.strictEqual(body[0].name, REPO, `Expected ${REPO}, got ${body[0].name}`);
  });

  it('should delete an object via HTTP request', async () => {
    const key = 'test-folder/page2';
    const ext = '.html';

    const url = `${SERVER_URL}/source/${ORG}/${REPO}/${key}${ext}`;
    let resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status}`);

    // validate page is not here
    resp = await fetch(`${SERVER_URL}/source/${ORG}/${REPO}/${key}${ext}`);
    assert.strictEqual(resp.status, 404, `Expected 404 Not Found, got ${resp.status}`);
  });

  it('should deal with no config found via HTTP request', async () => {
    const url = `${SERVER_URL}/config/${ORG}`;
    const resp = await fetch(url);

    assert.strictEqual(resp.status, 404, `Expected 404, got ${resp.status}`);
  });

  it('should delete root folder', async () => {
    const url = `${SERVER_URL}/source/${ORG}/${REPO}`;
    const resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 204, `Previous test should have logged out, got ${resp.status}`);
  });

  it('should post and get org config via HTTP request', async () => {
    // First POST the config - must include CONFIG write permission
    const configData = JSON.stringify({
      total: 2,
      limit: 2,
      offset: 0,
      data: [
        { path: 'CONFIG', actions: 'write', groups: 'anonymous' },
        { key: 'admin.role.all', value: 'test-value' },
      ],
      ':type': 'sheet',
      ':sheetname': 'permissions',
    });

    const formData = new FormData();
    formData.append('config', configData);

    let url = `${SERVER_URL}/config/${ORG}`;
    let resp = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status}`);

    // Now GET the config
    url = `${SERVER_URL}/config/${ORG}`;
    resp = await fetch(url);

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.json();
    assert.strictEqual(body.total, 2, `Expected 2, got ${body.total}`);
    assert.strictEqual(body.data[0].path, 'CONFIG', `Expected CONFIG, got ${body.data[0].path}`);
    assert.strictEqual(body.data[0].actions, 'write', `Expected write, got ${body.data[0].actions}`);
    assert.strictEqual(body.data[1].key, 'admin.role.all', `Expected admin.role.all, got ${body.data[1].key}`);
    assert.strictEqual(body.data[1].value, 'test-value', `Expected test-value, got ${body.data[1].value}`);
  });

  it('cannot recreate root folder because of auth (previous test should setup auth)', async () => {
    const formData = new FormData();
    const blob = new Blob(['{}'], { type: 'application/json' });
    const file = new File([blob], `${REPO}.props`, { type: 'application/json' });
    formData.append('data', file);

    const resp = await fetch(`${SERVER_URL}/source/${ORG}/${REPO}/${REPO}.props`, {
      method: 'POST',
      body: formData,
    });
    assert.strictEqual(resp.status, 401, `Previous test should have setup auth, got ${resp.status}`);
  });

  it('should logout via HTTP request', async () => {
    const url = `${SERVER_URL}/logout`;
    const resp = await fetch(url, {
      method: 'POST',
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);
  });
});
