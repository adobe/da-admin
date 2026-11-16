/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

function importKey(secret) {
  if (!secret) throw new Error('encryption key is not configured');
  return crypto.subtle.importKey('raw', fromBase64(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(secret, value) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return JSON.stringify({ iv: toBase64(iv), data: toBase64(new Uint8Array(data)) });
}

export async function unseal(secret, sealed) {
  const key = await importKey(secret);
  const { iv, data } = JSON.parse(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
