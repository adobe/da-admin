import assert from 'node:assert';

const workerUrl = process.env.WORKER_URL;
const ORG = 'da-e2e-test';

describe('/move operation', () => {
  // it('moves a file', async () => {
  // const label = 'move-spec-label';
  //   const blob = new Blob(['Hello World!'], { type: "text/html" });
  //   let body = new FormData();
  //   body.append('data', blob);
  //   let opts = {
  //     body,
  //     method: 'POST'
  //   };
  //   let req = new Request(`${workerUrl}/source/${ORG}/move-spec/test-file.html`, opts);
  //   let resp = await fetch(req);
  //   assert(resp.status === 200 || resp.status === 201);
  //
  //   // Create a labeled version so we can verify its referenced by the moved file.
  //   opts = {
  //     body: `{ "label": "${label}" }`,
  //     method: 'POST'
  //   }
  //   req = new Request(`${workerUrl}/versionsource/${ORG}/move-spec/test-file.html`, opts);
  //   resp = await fetch(req);
  //   assert.strictEqual(resp.status, 201);
  //
  //
  //   body = new FormData();
  //   body.append('destination', `${ORG}/move-spec/test-file-moved.html`)
  //   opts = {
  //     body,
  //     method: 'POST'
  //   }
  //   req = new Request(`${workerUrl}/move/${ORG}/move-spec/test-file.html`, opts);
  //   resp = await fetch(req);
  //   assert.strictEqual(resp.status, 204);
  //
  //   resp = await fetch(`${workerUrl}/source/${ORG}/move-spec/test-file.html`);
  //   assert.strictEqual(resp.status, 404);
  //
  //   resp = await fetch(`${workerUrl}/source/${ORG}/move-spec/test-file-moved.html`);
  //   assert.strictEqual(resp.status, 200);
  //
  //   resp = await fetch(`${workerUrl}/versionlist/${ORG}/move-spec/test-file-moved.html`);
  //   const json = await resp.json();
  //   assert(json.some((ver) => ver.label === label));
  // });

  it('moves a folder', async () => {
    const limit = 1;
    for (let i = 0; i < limit; i++) {
      const blob = new Blob(['Hello World!'], { type: "text/html" });
      let body = new FormData();
      body.append('data', blob);
      let opts = {
        body,
        method: 'POST'
      };
      let req = new Request(`${workerUrl}/source/${ORG}/move-spec/test-folder/index${i}.html`, opts);
      let resp = await fetch(req);
      assert(resp.status === 200 || resp.status === 201);
    }
    const body = new FormData();
    body.append('destination', `/${ORG}/move-spec/test-folder-moved`);
    const opts = {
      body,
      method: 'POST',
    };
    const req = new Request(`${workerUrl}/move/${ORG}/move-spec/test-folder`, opts);
    const resp = await fetch(req);
    assert.strictEqual(resp.status, 204);
    for (let i = 0; i < limit; i++) {
      let resp = await fetch(`${workerUrl}/source/${ORG}/move-spec/test-folder/index${i}.html`);
      assert.strictEqual(resp.status, 404);
      resp = await fetch(`${workerUrl}/source/${ORG}/move-spec/test-folder-moved/index${i}.html`);
      assert.strictEqual(resp.status, 200);
    }
  });
});
