import assert from 'node:assert';

const workerUrl = process.env.WORKER_URL;

const ORG = 'da-e2e-test'

describe('/list requests', function () {
  this.timeout(0);
  it('returns orgs', async () => {
    const req = new Request(`${workerUrl}/list`);
    const resp = await fetch(req);
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert(body.length > 0);
  });

  it('returns content', async () => {
    const blob = new Blob(['Hello World!'], { type: "text/html" });
    const body = new FormData();
    body.append('data', blob);
    const opts =  {
      body,
      method: 'POST'
    };
    let req = new Request(`${workerUrl}/source/${ORG}/list-spec/test-file.html`, opts);
    let resp = await fetch(req);
    assert(resp.status === 200 || resp.status === 201);
    req = new Request(`${workerUrl}/list/${ORG}/list-spec`);
    resp = await fetch(req);
    assert.strictEqual(resp.status, 200);
    const json = await resp.json();
    assert(json.some(org => org.path === `/${ORG}/list-spec/test-file.html`));

    resp = await fetch(`${workerUrl}/source/${ORG}/list-spec/test-file.html`, { method: 'DELETE' });
    assert.strictEqual(resp.status, 204);
  });
});
