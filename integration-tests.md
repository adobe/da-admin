# Integration Tests

The `da-admin` worker includes a suite of integration tests designed as "smoke tests". These tests validate:

- **Deployment Integrity**: Ensures the worker can be successfully deployed to the Cloudflare Workers runtime.
- **Core Functionality**: Verifies critical features such as authentication, read/write operations, and permission handling function correctly end-to-end.

## Architecture

The test entry point is [`./test/it/smoke.test.js`](./test/it/smoke.test.js), which sets up the environment and executes the test suite defined in [`./test/it/it-tests.js`](./test/it/it-tests.js). The tests can run in two modes:

1.  **Local Mode**: Runs entirely on the local machine using mocks and local servers.
2.  **Stage Mode**: Runs against a deployed version of the worker on Cloudflare (used in CI).

### 1. Local Mode

**Local Mode** is the default for development. It orchestrates a local environment consisting of:
- **`wrangler dev`**: Runs the `da-admin` worker locally.
- **`S3rver`**: A local S3-compatible object storage server to mock R2/S3.
- **Mock IMS Server**: A local HTTP server simulating Adobe IMS for authentication.

**Configuration:**
- Environment variables are automatically loaded from [`./.dev.vars.it`](./.dev.vars.it).
- No manual configuration is typically required.
- **Note**: In **Local Mode**, the DA configuration is ephemeral and set up before each test run.

**How to Run:**
```bash
npm run test:it
```

### 2. Stage Mode (CI/CD)

In **Stage Mode**, tests execute against a live worker deployed to Cloudflare. This verifies the actual deployment artifacts and Cloudflare environment behavior.

The tests create a repository `test-repo-<branchname>` under the `da-admin-ci-it-org` located in the `aem-content-stage` bucket. The config is predefined for this org and defines permissions for the test users (see below).

#### CI/CD Pipeline Flow

The GitHub Actions workflow executes these tests in two phases:

1.  **Deployment**:
    - `npm run deploy:ci`: Uploads a new version of the worker (tagged with the branch name) to the `ci` environment.
    - Generates a `.deployment-env` file containing the `WORKER_VERSION_ID`, `WORKER_PREVIEW_URL` and `WORKER_PREVIEW_BRANCH`.

2.  **Verification**:
    - `npm run test:postdeploy`: Sources the `.deployment-env` file and runs the test suite.
    - When `WORKER_PREVIEW_URL` is present in the environment, [`smoke.test.js`](./test/it/smoke.test.js) switches to **Stage Mode**.
    - Tests authenticates against a real IMS environment (Stage/Prod) and requests are sent to the deployed worker.

#### Running Stage Tests Locally

To debug CI failures or test against a deployed worker from your local machine:

1.  **Deploy the Worker**:
    ```bash
    npm run deploy:ci
    ```
    This script will generate the `.deployment-env` file in your root directory.

2.  **Configure Credentials**:
    Create a `.env` file (or set environment variables) with the required IMS credentials for the test account:
    ```env
    IT_IMS_STAGE_ENDPOINT=https://ims-na1.adobelogin.com
    IT_IMS_STAGE_CLIENT_ID=<client-id>
    IT_IMS_STAGE_CLIENT_SECRET=<client-secret>
    IT_IMS_STAGE_SCOPES=openid,AdobeID,aem.frontend.all,read_organizations,additional_info.projectedProductContext
    ```

3.  **Run the Tests**:
    ```bash
    # Loads the deployment vars and runs the tests
    npm run test:postdeploy2
    ```

### Persistence & Configuration

In **Stage Mode**, the tests rely on the `DA_CONFIG_STAGE` KV storage for permissions. This configuration is persistent.

If the configuration is lost or needs to be reset, the expected permission model is:

```json
{
  "total": 2,
  "limit": 2,
  "offset": 0,
  "data": [
    {
      "path": "CONFIG",
      "groups": "<test-user-email>",
      "actions": "write"
    },
    {
      "path": "/+**",
      "groups": "<test-user-email>",
      "actions": "write"
    }
  ],
  ":type": "sheet",
  ":sheetname": "permissions"
}
```

## IMS Configuration

In **Stage Mode**, tests execute against the **IMS Stage** environment.

### Prerequisites

1.  **Worker Configuration**: The `IMS_ORIGIN` secret for the `da-admin` worker (CI environment) must point to the IMS Stage endpoint.
2.  **User Existence**: Test users must exist and belong to an IMS Stage organization. No specific organization permissions are required beyond basic membership.
3.  **DA Configuration**: The test users must be explicitly granted permissions in the `DA_CONFIG` (as shown in the [Persistence & Configuration](#persistence--configuration) section).

### Test Users Setup

The integration tests use dedicated service accounts defined in the [Adobe Stage Developer Console](https://developer-stage.adobe.com/) under the `Document Authoring Stage` organization. Two distinct projects were created to simulate different user roles:

-   **Authenticated User Project**:
    -   **Purpose**: Simulates a user who is logged in but may not have specific permissions (used for negative testing or basic access).
    -   **Credentials**: Defined in CI secrets as `IT_IMS_STAGE_CLIENT_ID` / `IT_IMS_STAGE_CLIENT_SECRET`.
    -   **API**: Uses `Edge Delivery Service` to create OAuth Server-to-Server credentials.

-   **Authorized User Project**:
    -   **Purpose**: Simulates a user with full read/write permissions.
    -   **Credentials**: (Currently the tests primarily use one set of credentials which are authorized in the config).
    -   **API**: Uses `Edge Delivery Service` to create OAuth Server-to-Server credentials.

> **Notes on Setup:**
> 1.  **Multiple Projects**: Two separate projects were created because generating multiple independent credentials within a single project was not supported.
> 2.  **Role Distinction**: The distinction between "authenticated" and "authorized" is managed entirely within the `DA_CONFIG` permissions sheet, not in IMS. The project naming reflects the intended use case.
> 3.  **API Selection**: The `Edge Delivery Service` API was selected for convenience. Any API service can be used provided it:
>     -   Supports IMS connection.
>     -   Includes the `read_organizations` scope.
