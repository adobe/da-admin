# Document Authoring Admin
## Introduction
Document Authoring Admin is the API used to store and retrieve files and details from the Document Authoring content repository.

You can read the official API docs here: https://docs.da.live

## Info
[![codecov](https://codecov.io/github/adobe/da-admin/graph/badge.svg?token=RP74sW9MlC)](https://codecov.io/github/adobe/da-admin)

## Getting started

### Requirements
1. Node 20+

### Local development

#### 1. Clone
```bash
git clone git@github.com:adobe/da-admin
```
#### 2. Install
In a terminal, run `npm install` this repo's folder.

#### 3. Login
Use `npx wrangler login`. Walk through the steps in browser.

#### 4. Setup an auth KV
KV is used for high-performance R/W operations. This value is stored locally.
```bash
npx wrangler kv:key put orgs '[{"name":"aemsites","created":"2023-10-31T17:43:13.390Z"}]' --binding=DA_AUTH --local
```
#### 5. Start the local server
At the root of the project folder, run `npm run dev`.

#### 6. Validate
Browse to `http://localhost:8787/list` to ensure you see the expected buckets.

### Additional details

1. You can make your own buckets tied to your own Cloudflare account or you can request a `.dev.vars` file.
2. Cloudflare KV, which is used for org properties and session login info is locally stored when developing locally. You will need to make your own local KVs to test against.
