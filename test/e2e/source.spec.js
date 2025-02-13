import assert from 'node:assert';

const workerUrl = process.env.WORKER_URL;
const ORG = 'da-e2e-test';

describe('/source requests', () => {

  it('returns 404 for non-existing object', async () => {
    const req = new Request(`${workerUrl}/source/${ORG}/source-spec/does-not-exist.html`);
    const resp = await fetch(req);
    assert.strictEqual(resp.status, 404);
  });

  it('saves content', async () => {
    const blob = new Blob(['Hello World!'], { type: "text/html" });
    const body = new FormData();
    body.append('data', blob);
    const opts =  {
      body,
      method: 'POST'
    };
    const req = new Request(`${workerUrl}/source/${ORG}/source-spec/test-file.html`, opts);
    const resp = await fetch(req);
    assert(resp.status === 200 || resp.status === 201);
  });

  it('heads saved content', async () => {
    const req = new Request(`${workerUrl}/source/${ORG}/source-spec/test-file.html`, { method: 'HEAD' });

    const resp = await fetch(req);
    assert(resp.status === 200 || resp.status === 201);
    assert.strictEqual(resp.headers.get('Content-Type'), 'text/html');
    const body = resp.body;
    assert.ifError(body)
  });

  it('gets saved content', async () => {
    const req = new Request(`${workerUrl}/source/${ORG}/source-spec/test-file.html`);

    const resp = await fetch(req);
    assert(resp.status === 200 || resp.status === 201);
    assert.strictEqual(resp.headers.get('Content-Type'), 'text/html');
    const body = await resp.text();
    assert.strictEqual(body, 'Hello World!');
  });

  it('deletes saved content', async () => {
    let req = new Request(`${workerUrl}/source/${ORG}/source-spec/test-file.html`, { method: 'DELETE' });

    let resp = await fetch(req);
    assert.strictEqual(resp.status, 204);
    req = new Request(`${workerUrl}/source/${ORG}/source-spec/test-file.html`);
    resp = await fetch(req);
    assert.strictEqual(resp.status, 404);
  });

});
