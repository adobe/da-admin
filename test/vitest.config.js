import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const collabCalls = {};

export default defineWorkersConfig({
  test: {
    include: ['**/*.vitest.js'],
    coverage: {
      provider: 'istanbul',
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: '../wrangler.toml' },
        miniflare: {
          serviceBindings: {
            dacollab: async (request) => {
              if (collabCalls[request.url]) {
                const resp = { status: 200, body: collabCalls[request.url] };
                delete collabCalls[request.url];
                return resp;
              } else {
                collabCalls[request.url] = 'called';
                return { status: 204 };
              }
            },
          },
        }
      },
    },
  },
});
