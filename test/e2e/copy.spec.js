

import assert from 'node:assert';

const workerUrl = process.env.WORKER_URL;
const ORG = 'da-e2e-test';

describe('/copy operation', () => {
  it('copies a file', async function() {
    this.timeout(60000);

    const blob = new Blob(['Hello World!'], { type: "text/html" });
    let body = new FormData();
    body.append('data', blob);
    let opts = {
      body,
      method: 'POST'
    };
    let req = new Request(`${workerUrl}/source/${ORG}/copy-spec/test-file.html`, opts);
    let resp = await fetch(req);
    assert(resp.status === 200 || resp.status === 201);

    body = new FormData();
    body.append('destination', `${ORG}/copy-spec/test-file-copy.html`)
    opts = {
      body,
      method: 'POST'
    }
    req = new Request(`${workerUrl}/copy/${ORG}/copy-spec/test-file.html`, opts);
    resp = await fetch(req);
    assert.strictEqual(resp.status, 204);

    resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-file.html`);
    assert.strictEqual(resp.status, 200);

    resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-file-copy.html`);
    assert.strictEqual(resp.status, 200);
    const content = await resp.text();
    assert.strictEqual(content, 'Hello World!');

    resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-file.html`, { method: 'DELETE' });
    assert.strictEqual(resp.status, 204);

    resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-file-copy.html`, { method: 'DELETE' });
    assert.strictEqual(resp.status, 204);
  });

  it('copies a folder', async function()  {
    this.timeout(60000);
    const limit = 5;
    for (let i = 0; i < limit; i++) {
      const blob = new Blob(['Hello World!'], { type: "text/html" });
      let body = new FormData();
      body.append('data', blob);
      let opts = {
        body,
        method: 'POST'
      };
      let req = new Request(`${workerUrl}/source/${ORG}/copy-spec/test-folder/index${i}.html`, opts);
      let resp = await fetch(req);
      assert(resp.status === 200 || resp.status === 201);
    }
    const body = new FormData();
    body.append('destination', `/${ORG}/copy-spec/test-folder-copy`);
    const opts = {
      body,
      method: 'POST',
    };
    const req = new Request(`${workerUrl}/copy/${ORG}/copy-spec/test-folder`, opts);
    const resp = await fetch(req);
    assert.strictEqual(resp.status, 204);
    for (let i = 0; i < limit; i++) {
      let resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-folder/index${i}.html`);
      assert.strictEqual(resp.status, 200);
      resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-folder-copy/index${i}.html`);
      assert.strictEqual(resp.status, 200);

      resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-folder/index${i}.html`, { method: 'DELETE' });
      assert.strictEqual(resp.status, 204);
      resp = await fetch(`${workerUrl}/source/${ORG}/copy-spec/test-folder-copy/index${i}.html`, { method: 'DELETE' });
      assert.strictEqual(resp.status, 204);
    }
  });
});
