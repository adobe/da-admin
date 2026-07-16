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
  this.timeout(10000);

  it('[super user] should set org config', async function shouldSetOrgConfig() {
    if (!ctx.local) {
      // in stage, the config is already set and we should not overwrite it
      // to preserve the setup and be able to access the content
      this.skip();
    }
    const {
      serverUrl, org, superUser,
    } = ctx;
    const configData = JSON.stringify({
      total: 2,
      limit: 2,
      offset: 0,
      data: [
        { path: 'CONFIG', groups: superUser.email, actions: 'write' },
        { path: '/+**', groups: superUser.email, actions: 'write' },
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
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });

    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] should get org config', async () => {
    const {
      serverUrl, org, superUser,
    } = ctx;
    const url = `${serverUrl}/config/${org}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.email}`);

    const body = await resp.json();
    // check initial config is clean
    assert.strictEqual(body.total, 2, `Expected 2, got ${body.total}`);
    assert.strictEqual(body.data[0].path, 'CONFIG', `Expected CONFIG, got ${body.data[0].path}`);
    assert.strictEqual(body.data[0].groups, superUser.email, `Expected user email, got ${body.data[0].groups}`);
    assert.strictEqual(body.data[0].actions, 'write', `Expected write, got ${body.data[0].actions}`);
    assert.strictEqual(body.data[1].path, '/+**', `Expected /+**, got ${body.data[1].path}`);
    assert.strictEqual(body.data[1].groups, superUser.email, `Expected user email, got ${body.data[1].groups}`);
    assert.strictEqual(body.data[1].actions, 'write', `Expected write, got ${body.data[1].actions}`);
    assert.strictEqual(body[':type'], 'sheet', `Expected sheet, got ${body[':type']}`);
    assert.strictEqual(body[':sheetname'], 'permissions', `Expected permissions, got ${body[':sheetname']}`);
  });

  it('[anonymous] cannot delete root folder', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('[limited user] cannot delete root folder', async () => {
    const {
      serverUrl, org, repo, limitedUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[super user] should delete root folder to cleanup the bucket', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status} - user: ${superUser.email}`);

    // validate bucket is empty
    const listResp = await fetch(`${serverUrl}/list/${org}/${repo}`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(listResp.status, 200, `Expected 200 OK, got ${listResp.status} - user: ${superUser.email}`);
    const listBody = await listResp.json();
    assert.strictEqual(listBody.length, 0, `Expected 0 items, got ${listBody.length} - user: ${superUser.email}`);
  });

  it('[super user] should create a repo', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;

    const resp = await fetch(`${serverUrl}/source/${org}/${repo}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201 for marker, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[anonymous] not allowed to read', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'GET',
    });
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('[limited user] not allowed to read', async () => {
    const {
      serverUrl, org, repo, limitedUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[anonymous] cannot list repos', async () => {
    const {
      serverUrl, org,
    } = ctx;
    const url = `${serverUrl}/list/${org}`;
    const resp = await fetch(url);
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('[limited user] cannot list repos', async () => {
    const {
      serverUrl, org, limitedUser,
    } = ctx;
    const url = `${serverUrl}/list/${org}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[super user] should list repos', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const url = `${serverUrl}/list/${org}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.email}`);

    const body = await resp.json();
    assert.ok(body.length > 0, `Expected at least 1 repo, got ${body.length} - user: ${superUser.email}`);
    // need to find the current repo in the list
    const repoItem = body.find((item) => item.name === repo);
    assert.ok(repoItem, `Expected ${repo} to be in the list - user: ${superUser.email}`);
  });

  it('[anonymous] cannot create a page', async () => {
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

  it('[limited user] cannot create a page', async () => {
    const {
      serverUrl, org, repo, limitedUser,
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
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });

    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[super user] should create pages', async () => {
    const {
      serverUrl, org, repo, superUser,
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
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });

    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status} - user: ${superUser.email}`);

    let body = await resp.json();
    assert.strictEqual(body.source.editUrl, `https://da.live/edit#/${org}/${repo}/${key}`);
    assert.strictEqual(body.source.contentUrl, `https://content.da.live/${org}/${repo}/${key}`);
    assert.strictEqual(body.aem.previewUrl, `https://main--${repo}--${org}.aem.page/${key}`);
    assert.strictEqual(body.aem.liveUrl, `https://main--${repo}--${org}.aem.live/${key}`);

    // validate page is here (include extension in GET request)
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/${key}${ext}`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.email}`);

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
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] cannot list the reserved .da-versions folder via the generic list route', async () => {
    // Version bodies and audit logs live at '{repo}/.da-versions/{fileId}/...'.
    // Creating the pages above wrote audit entries there, so without the router
    // guard this list returns 200 with those entries; only /versionlist may reach
    // them. The guard must make the generic list route 404 instead.
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const resp = await fetch(`${serverUrl}/list/${org}/${repo}/.da-versions`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 404, `Expected 404 from the router guard, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] cannot read or write a .da-versions object via the generic source route', async () => {
    // Without the guard this POST forges an audit/version object under
    // .da-versions and the GET reads it back. The guard must 404 both.
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/.da-versions/forge-test/leak.html`;
    const formData = new FormData();
    const blob = new Blob(['<html><body>forged</body></html>'], { type: 'text/html' });
    formData.append('data', new File([blob], 'leak.html', { type: 'text/html' }));
    const putResp = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(putResp.status, 404, `Expected 404 from the router guard on write, got ${putResp.status} - user: ${superUser.email}`);
    const getResp = await fetch(url, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(getResp.status, 404, `Expected 404 from the router guard on read, got ${getResp.status} - user: ${superUser.email}`);
  });

  it('[super user] source PUT rejects a guid that contains a .da-versions segment', async () => {
    // The guid becomes the document file id and keys the reserved
    // .da-versions/{id}/... space. A guid with path separators or a .da-versions
    // segment must not be accepted, or it would steer the write outside that space.
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/guid-craft-seg.html`;
    const formData = new FormData();
    const blob = new Blob(['<html><body>craft</body></html>'], { type: 'text/html' });
    formData.append('data', new File([blob], 'guid-craft-seg.html', { type: 'text/html' }));
    formData.append('guid', 'x/.da-versions/forged');
    const resp = await fetch(url, {
      method: 'PUT',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 400, `Expected 400 for a crafted guid, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] source PUT rejects a non-UUID guid', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/guid-craft-plain.html`;
    const formData = new FormData();
    const blob = new Blob(['<html><body>craft</body></html>'], { type: 'text/html' });
    formData.append('data', new File([blob], 'guid-craft-plain.html', { type: 'text/html' }));
    formData.append('guid', 'not-a-uuid');
    const resp = await fetch(url, {
      method: 'PUT',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 400, `Expected 400 for a non-UUID guid, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] source PUT accepts a valid UUID guid and stores it as the file id', async () => {
    // A well formed guid is the supported contract and must still work.
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const validGuid = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
    const url = `${serverUrl}/source/${org}/${repo}/guid-valid.html`;
    const formData = new FormData();
    const blob = new Blob(['<html><body>valid</body></html>'], { type: 'text/html' });
    formData.append('data', new File([blob], 'guid-valid.html', { type: 'text/html' }));
    formData.append('guid', validGuid);
    const resp = await fetch(url, {
      method: 'PUT',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.ok([200, 201].includes(resp.status), `Expected 200 or 201 for a valid guid, got ${resp.status} - user: ${superUser.email}`);
    assert.strictEqual(resp.headers.get('x-da-id'), validGuid, `Expected the stored file id to match the guid - user: ${superUser.email}`);
  });

  it('[limited user] cannot read page1', async () => {
    const {
      serverUrl, org, repo, limitedUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/test-folder/page1.html`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[limited user] cannot read page2', async () => {
    const {
      serverUrl, org, repo, limitedUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/test-folder/page2.html`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[super user] should update the config to allow limited user to read page2', async () => {
    const {
      serverUrl, org, repo, superUser, limitedUser,
    } = ctx;
    // read config
    const url = `${serverUrl}/config/${org}`;
    let resp = await fetch(url, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    const body = await resp.json();

    // add the new config data
    const newConfigData = [
      ...body.data,
      { path: `/${repo}/test-folder/page2.html`, groups: limitedUser.email, actions: 'read' },
    ];

    // post the new config
    const formData = new FormData();
    formData.append('config', JSON.stringify({
      total: newConfigData.length,
      limit: newConfigData.length,
      offset: 0,
      data: newConfigData,
      ':type': 'sheet',
      ':sheetname': 'permissions',
    }));
    resp = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 201, `Expected 201 Created, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[limited user] can now read page2', async () => {
    const {
      serverUrl, org, repo, limitedUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/test-folder/page2.html`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);
  });

  it('[limited user] still cannot read page1', async () => {
    const {
      serverUrl, org, repo, limitedUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/test-folder/page1.html`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[super user] should remove added entries to clean up the config', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const url = `${serverUrl}/config/${org}`;
    let resp = await fetch(url, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    let body = await resp.json();
    const newConfigData = body.data.filter((item) => item.path !== `/${repo}/test-folder/page2.html`);
    const formData = new FormData();
    formData.append('config', JSON.stringify({
      total: newConfigData.length,
      limit: newConfigData.length,
      offset: 0,
      data: newConfigData,
      ':type': 'sheet',
      ':sheetname': 'permissions',
    }));
    resp = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 201, `Expected 201 Created, got ${resp.status} - user: ${superUser.email}`);
    resp = await fetch(url, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    body = await resp.json();
    assert.strictEqual(body.total, 2, `Expected 2, got ${body.total}`);
    assert.strictEqual(body.data[0].path, 'CONFIG', `Expected CONFIG, got ${body.data[0].path}`);
    assert.strictEqual(body.data[0].groups, superUser.email, `Expected user email, got ${body.data[0].groups}`);
    assert.strictEqual(body.data[0].actions, 'write', `Expected write, got ${body.data[0].actions}`);
    assert.strictEqual(body.data[1].path, '/+**', `Expected /+**, got ${body.data[1].path}`);
    assert.strictEqual(body.data[1].groups, superUser.email, `Expected user email, got ${body.data[1].groups}`);
    assert.strictEqual(body.data[1].actions, 'write', `Expected write, got ${body.data[1].actions}`);
    assert.strictEqual(body[':type'], 'sheet', `Expected sheet, got ${body[':type']}`);
    assert.strictEqual(body[':sheetname'], 'permissions', `Expected permissions, got ${body[':sheetname']}`);
  });

  it('[limited user] cannot read page2 anymore', async () => {
    const {
      serverUrl, org, repo, limitedUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/test-folder/page2.html`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 403, `Expected 403 Unauthorized, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[anonymous] cannot list objects', async () => {
    const {
      serverUrl, org, repo,
    } = ctx;
    const url = `${serverUrl}/list/${org}/${repo}`;
    const resp = await fetch(url);
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('[super user] should list objects', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const key = 'test-folder';

    const url = `${serverUrl}/list/${org}/${repo}/${key}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.email}`);

    const body = await resp.json();

    const fileNames = body.map((item) => item.name);
    assert.ok(fileNames.includes('page1'), 'Should list page1');
    assert.ok(fileNames.includes('page2'), 'Should list page2');
  });

  it('[super user] should copy a page within the org', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const formData = new FormData();
    formData.append('destination', `/${org}/${repo}/test-folder/page1-copy.html`);

    let resp = await fetch(`${serverUrl}/copy/${org}/${repo}/test-folder/page1.html`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status} - user: ${superUser.email}`);

    // validate the copy exists
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/test-folder/page1-copy.html`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.email}`);
    const body = await resp.text();
    assert.strictEqual(body, '<html><body><h1>Page 1</h1></body></html>');
  });

  it('[super user] cannot copy a page to another org', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const formData = new FormData();
    formData.append('destination', `/other-${org}/${repo}/test-folder/page1-xorg.html`);

    let resp = await fetch(`${serverUrl}/copy/${org}/${repo}/test-folder/page1.html`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 400, `Expected 400 Bad Request, got ${resp.status} - user: ${superUser.email}`);
    const body = await resp.json();
    assert.match(body.error, /same org/i, `Expected cross-org error, got ${body.error}`);

    // validate no phantom copy was re-anchored into the source org
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/test-folder/page1-xorg.html`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 404, `Expected 404 Not Found, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] cannot move a page to another org', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const formData = new FormData();
    formData.append('destination', `/other-${org}/${repo}/test-folder/page1-moved.html`);

    let resp = await fetch(`${serverUrl}/move/${org}/${repo}/test-folder/page1-copy.html`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 400, `Expected 400 Bad Request, got ${resp.status} - user: ${superUser.email}`);
    const body = await resp.json();
    assert.match(body.error, /same org/i, `Expected cross-org error, got ${body.error}`);

    // validate the source was not touched
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/test-folder/page1-copy.html`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] cannot copy or move into the reserved .da-versions folder', async () => {
    // The generic copy/move routes take their destination from the request body.
    // A destination inside {repo}/.da-versions/... lands in version and audit
    // storage and forges a document's history. The destination guard must reject
    // it with 400, whatever the caller's grants.
    const {
      serverUrl, org, repo, superUser,
    } = ctx;

    const copyForm = new FormData();
    copyForm.append('destination', `/${org}/${repo}/.da-versions/forge-target/audit-9999999999.txt`);
    let resp = await fetch(`${serverUrl}/copy/${org}/${repo}/test-folder/page1.html`, {
      method: 'POST',
      body: copyForm,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 400, `Expected 400 from the destination guard on copy, got ${resp.status} - user: ${superUser.email}`);
    let body = await resp.json();
    assert.match(body.error, /da-versions/i, `Expected reserved-folder error, got ${body.error}`);

    const moveForm = new FormData();
    moveForm.append('destination', `/${org}/${repo}/.da-versions/forge-target/0000.html`);
    resp = await fetch(`${serverUrl}/move/${org}/${repo}/test-folder/page1-copy.html`, {
      method: 'POST',
      body: moveForm,
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 400, `Expected 400 from the destination guard on move, got ${resp.status} - user: ${superUser.email}`);
    body = await resp.json();
    assert.match(body.error, /da-versions/i, `Expected reserved-folder error, got ${body.error}`);

    // the blocked move must leave the source in place
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/test-folder/page1-copy.html`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[anonymous] cannot delete an object', async () => {
    const {
      serverUrl, org, repo, key,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}/${key}`;
    const resp = await fetch(url, {
      method: 'DELETE',
    });
    assert.strictEqual(resp.status, 401, `Expected 401 Unauthorized, got ${resp.status}`);
  });

  it('[super user] should delete an object', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const key = 'test-folder/page2';
    const ext = '.html';

    const url = `${serverUrl}/source/${org}/${repo}/${key}${ext}`;
    let resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status} - user: ${superUser.email}`);

    // validate page is not here
    resp = await fetch(`${serverUrl}/source/${org}/${repo}/${key}${ext}`, {
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 404, `Expected 404 Not Found, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[super user] should do a final delete of the root folder', async () => {
    const {
      serverUrl, org, repo, superUser,
    } = ctx;
    const url = `${serverUrl}/source/${org}/${repo}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });
    assert.strictEqual(resp.status, 204, `Expected 204 No Content, got ${resp.status} - user: ${superUser.email}`);
  });

  it('[limited user] should logout', async () => {
    const { serverUrl, limitedUser } = ctx;
    const url = `${serverUrl}/logout`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${limitedUser.accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${limitedUser.email}`);
  });

  it('[super user] should logout', async () => {
    const { serverUrl, superUser } = ctx;
    const url = `${serverUrl}/logout`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superUser.accessToken}` },
    });

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status} - user: ${superUser.userId}`);
  });
});
