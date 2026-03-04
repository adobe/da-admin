/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/* eslint-disable camelcase */
const fetch = async (url, opts) => {
  const ok = !opts.headers.get('x-mock-fail');
  const mockAuth = opts.headers.get('Authorization').split(' ').pop();
  // eslint-disable-next-line no-unused-vars
  const [email, created_at, expires_in] = mockAuth.split(':');

  return {
    ok,
    status: 200,
    // eslint-disable-next-line no-nested-ternary
    json: async () => (url.endsWith('/ims/profile/v1') ? {
      email,
      userId: '123',
    } : url.endsWith('/ims/organizations/v5') ? [{
      orgName: 'Org1',
      orgRef: { ident: '2345B0EA551D747', authSrc: 'AdobeOrg' },
      orgType: 'Enterprise',
      countryCode: 'US',
      groups: [{
        groupName: 'READ_WRITE_STANDARD@DEV', role: 'TEAM_MEMBER', ident: 4711, groupType: 'USER', groupDisplayName: 'READ_WRITE_STANDARD@DEV',
      }, {
        groupName: 'READ_ONLY_STANDARD@PROD', role: 'TEAM_MEMBER', ident: 8080, groupType: 'USER', groupDisplayName: 'READ_ONLY_STANDARD@PROD',
      }],
    }, {
      orgName: 'Org No groups', orgRef: { ident: '139024093', authSrc: 'AdobeOrg' }, orgType: 'Enterprise', countryCode: 'US', groups: [],
    }, {
      orgName: 'ACME Inc.',
      orgRef: { ident: 'EE23423423423', authSrc: 'AdobeOrg' },
      orgType: 'Enterprise',
      countryCode: 'US',
      groups: [{
        groupName: 'Emp', role: 'TEAM_MEMBER', ident: 12312312, groupType: 'LICENSE', groupDisplayName: 'Emp',
      }, {
        groupName: 'org-test', role: 'TEAM_MEMBER', ident: 34243, groupType: 'LICENSE', groupDisplayName: 'org-test',
      }],
    }] : {}),
  };
};

export default fetch;
