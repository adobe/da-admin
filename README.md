# Document Authoring Admin
## Introduction
Document Authoring Admin is the API used to store and retrieve files and details from the Document Authoring content repository.

You can read the official API docs here: https://docs.da.live

## Info
[![codecov](https://codecov.io/github/adobe/da-admin/graph/badge.svg?token=RP74sW9MlC)](https://codecov.io/github/adobe/da-admin)

## Getting started

### Requirements
1. Node 20+

## Installation

The service uses the following environment variables:

| Name                 | Description                         | Required | Default                |
|:---------------------|:------------------------------------|:---------|:-----------------------|
| DA_COLLAB            | URL to DA Collab Service            | No       | https://collab.da.live |
| IMS_ORIGIN           | URL to the IMS Origin API endpoint  | Yes      | -                      |
| S3_DEF_URL           | URL to the R2 Bucket Storage        | Yes      | -                      |
| S3_ACCESS_KEY_ID     | Cloudflare Access Key for R2 Bucket | Yes      | -                      |
| S3_SECRET_ACCESS_KEY | Cloudflare Secret Key for R2 Bucket | Yes      | -                      |
| DA_BUCKET_NAME       | Name of R2 Bucket                   | Yes      | da-content             |



## Local development

#### 1. Clone
```bash
git clone git@github.com:adobe/da-admin
```
#### 2. Install
In a terminal, run `npm install` this repo's folder.

#### 3. Create S3 Bucket
Make sure you have Docker Desktop installed and running. 
In a terminal run:
```bash
npm run docker:up
```

#### 4. Create a `.dev.vars` file
Create a `.dev.vars` file at the root of the project folder with the following content:
```
S3_DEF_URL="http://localhost:9090/"
S3_ACCESS_KEY_ID="accessKey"
S3_SECRET_ACCESS_KEY="secretKey"
```

#### 5. Start the local server
At the root of the project folder, run `npm run dev`.

#### 6. Setup DA_AUTH KV
KV is used for high-performance R/W operations. This value is stored locally.
```bash
npx wrangler kv:key put orgs '[{"name":"local-test","created":"2023-10-31T17:43:13.390Z"}]' --binding=DA_AUTH --local --env dev
```

#### 6. Validate
Browse to `http://localhost:8787/list` to ensure you see the expected buckets.

#### Shutting down
After stopping the local server, make sure you also stop docker:
```bash
npm run docker:down
```

### Running E2E Tests Locally
Follow the steps above to get the local server running. Then, in a separate terminal, run:
```bash
WORKER_URL=http://localhost:8787 npm run test:e2e
```
