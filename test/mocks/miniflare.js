import { Miniflare } from 'miniflare';

const orgs = ['adobe', 'geometrixx', 'wknd'];

const config = {
  geometrixx: {
    "total": 1,
    "limit": 1,
    "offset": 0,
    "data": [{ "key": "admin.role.all", "value": "aparker@geometrixx.info" }],
    ":type": "sheet"
  },
  adobe: {
    "total": 1,
    "limit": 1,
    "offset": 0,
    "data": [{ "key": "admin.role.all", "value": "notyou@you.com" }],
    ":type": "sheet"
  }
};

/**
 * Builds the Miniflare instance with the necessary bindings for the tests.
 * @return {Miniflare}
 */
export async function getMiniflare() {
  const mf = new Miniflare({
    modules: true,
    // Need a script to initialize Miniflare
    script: `
        export default {
          async fetch(request, env, ctx) {
            return new Response("Hello Miniflare!");
          }
        }
      `,
    kvNamespaces: { DA_AUTH: 'DA_AUTH', DA_CONFIG: 'DA_CONFIG' },
    r2Buckets: { DA_CONTENT: 'DA_CONTENT' },
  });
  const env = await mf.getBindings();
  for (let name of orgs) {
    const auth = config[name];
    await env.DA_CONTENT.put(`${name}/${name}.props`, `name=${name}`);
    if (auth) await env.DA_CONFIG.put(name, JSON.stringify(auth));
  }

  // Bypass the IMS fetch
  const user_id = 'aparker@geometrixx.info';
  env.DA_AUTH.put(user_id, JSON.stringify({ email: user_id }))

  return mf;
}

export async function destroyMiniflare(mf) {
  if (mf) await mf.dispose();
}

