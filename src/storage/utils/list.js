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
export default function formatList(resp) {
  function compare(a, b) {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return undefined;
  }

  const { delimitedPrefixes, objects } = resp;

  const combined = [];

  if (delimitedPrefixes) {
    delimitedPrefixes.forEach((prefix) => {
      // eslint-disable-next-line no-param-reassign
      prefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      const name = prefix.split('/').pop();
      const splitName = name.split('.');

      // Do not add any extension folders
      if (splitName.length > 1) return;

      const path = `/${prefix}`;
      combined.push({ path, name });
    });
  }

  if (objects) {
    objects.forEach((content) => {
      let { key } = content;
      const itemName = key.split('/').pop();
      const splitName = itemName.split('.');
      // file.jpg.props should not be a part of the list
      // hidden files (.props) should not be a part of this list
      if (splitName.length !== 2) return;

      const [name, ext] = splitName;
      // See if the folder is already in the list
      if (ext === 'props') {
        if (combined.some((item) => item.name === name)) return;

        // Remove props from the key so it can look like a folder
        // eslint-disable-next-line no-param-reassign
        key = key.replace('.props', '');
      }

      // Do not show any hidden files.
      if (!name) return;
      const item = { path: `/${key}`, name };
      if (ext !== 'props') item.ext = ext;

      combined.push(item);
    });
  }

  return combined.sort(compare);
}
