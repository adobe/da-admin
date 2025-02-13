import assert from 'node:assert';

const workerUrl = process.env.WORKER_URL;
const ORG = 'da-e2e-test';

describe('/version* operations', function () {
  this.timeout(0);

  const label = 'version-spec-label';
  it('creates a version of a file', async () => {
    const blob = new Blob(['Hello World!'], { type: "text/html" });
    let body = new FormData();
    body.append('data', blob);
    let opts = {
      body,
      method: 'POST'
    };
    let req = new Request(`${workerUrl}/source/${ORG}/version-spec/test-file.html`, opts);
    let resp = await fetch(req);
    assert(resp.status === 200 || resp.status === 201);

    opts = {
      body: `{ "label": "${label}" }`,
      method: 'POST'
    }
    req = new Request(`${workerUrl}/versionsource/${ORG}/version-spec/test-file.html`, opts);
    resp = await fetch(req);
    assert.strictEqual(resp.status, 201);
  });

  it('lists versions of a file', async () => {
    let req = new Request(`${workerUrl}/versionlist/${ORG}/version-spec/test-file.html`);
    let resp = await fetch(req);
    assert.strictEqual(resp.status, 200);
    const json = await resp.json();
    assert(json.some((ver) => ver.label === label));
  });

  it('gets content for a specific version', async () => {
    const blob = new Blob(['Changed Body!'], { type: "text/html" });
    const body = new FormData();
    body.append('data', blob);
    let opts = {
      body,
      method: 'POST'
    };
    let req = new Request(`${workerUrl}/source/${ORG}/version-spec/test-file.html`, opts);
    let resp = await fetch(req);
    assert(resp.status === 200 || resp.status === 201);

    req = new Request(`${workerUrl}/versionlist/${ORG}/version-spec/test-file.html`);
    resp = await fetch(req);

    const json = await resp.json();
    const labeled = json.find((ver) => ver.label === label);

    resp = await fetch(`${workerUrl}${labeled.url}`);
    const labeledContent = await resp.text()
    assert.strictEqual(labeledContent, 'Hello World!');

    resp = await fetch(`${workerUrl}/source/${ORG}/version-spec/test-file.html`);
    const currentContent = await resp.text();
    assert.strictEqual(currentContent, 'Changed Body!');
    assert.notStrictEqual(labeledContent, currentContent);

    resp = await fetch(`${workerUrl}/source/${ORG}/version-spec/test-file.html`, { method: 'DELETE' });
    assert.strictEqual(resp.status, 204);
  });
});
