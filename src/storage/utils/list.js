/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import {
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

function mapPrefixes(CommonPrefixes, daCtx) {
  return CommonPrefixes?.map((prefix) => {
    const name = prefix.Prefix.slice(0, -1).split('/').pop();
    const splitName = name.split('.');

    // Do not add any extension folders
    if (splitName.length > 1) return null;

    const path = `/${daCtx.org}/${prefix.Prefix.slice(0, -1)}`;

    return { path, name };
  }).filter((x) => !!x) ?? [];
}

function mapContents(Contents, folders, daCtx) {
  return Contents?.map((content) => {
    const itemName = content.Key.split('/').pop();
    const splitName = itemName.split('.');
    // file.jpg.props should not be a part of the list
    // hidden files (.props) should not be a part of this list
    if (splitName.length !== 2) return null;

    const [name, ext, props] = splitName;

    // Do not show any props sidecar files
    if (props) return null;

    // See if the folder is already in the list
    if (ext === 'props') {
      if (folders.some((item) => item.name === name)) return null;

      // Remove props from the key so it can look like a folder
      // eslint-disable-next-line no-param-reassign
      content.Key = content.Key.replace('.props', '');
    }

    // Do not show any hidden files.
    if (!name) return null;
    const item = { path: `/${daCtx.org}/${content.Key}`, name };
    if (ext !== 'props') {
      item.ext = ext;
      item.lastModified = content.LastModified.getTime();
    }

    return item;
  }).filter((x) => !!x) ?? [];
}

// Performs the same as formatList, but doesn't sort
// This prevents bugs when sorting across pages of the paginated api response
// However, the order is slightly different to the formatList return value
export function formatPaginatedList(resp, daCtx) {
  const { Contents } = resp;

  const combined = [];

  const files = mapContents(Contents, [], daCtx);
  combined.push(...files);

  return combined;
}

export default function formatList(resp, daCtx) {
  function compare(a, b) {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return undefined;
  }

  const { CommonPrefixes, Contents } = resp;

  const combined = [];

  const folders = mapPrefixes(CommonPrefixes, daCtx);
  combined.push(...folders);

  const files = mapContents(Contents, folders, daCtx);
  combined.push(...files);

  return combined.sort(compare);
}

function buildInput(org, key) {
  return {
    Bucket: `${org}-content`,
    Prefix: `${key}/`,
    MaxKeys: 300,
  };
}

/**
 * Lists a files in a bucket under the specified key.
 * @param {DaCtx} daCtx the DA Context
 * @param {Object} details contains any prevous Continuation token
 * @param s3client
 * @return {Promise<{sourceKeys: String[], continuationToken: String}>}
 */
export async function listCommand(daCtx, details, s3client) {
  // There's no need to use the list command if the item has an extension
  if (daCtx.ext) return { sourceKeys: [daCtx.key] };

  const input = buildInput(daCtx.org, daCtx.key);
  const { continuationToken } = details;

  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const sourceKeys = [];
  if (!continuationToken) sourceKeys.push(daCtx.key, `${daCtx.key}.props`);

  const commandInput = { ...input, ContinuationToken: continuationToken };
  const command = new ListObjectsV2Command(commandInput);
  const resp = await s3client.send(command);

  const { Contents = [], NextContinuationToken } = resp;
  sourceKeys.push(...Contents.map(({ Key }) => Key));

  return { sourceKeys, continuationToken: NextContinuationToken };
}
