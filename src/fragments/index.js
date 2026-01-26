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

import { FragmentGateway, getWebMiddleware } from 'web-fragments/gateway';

/**
 * Initialize the FragmentGateway
 */
const gateway = new FragmentGateway();

/**
 * Register the DA AI Assistant fragment
 * This allows the chat assistant to be embedded across DA applications
 */
gateway.registerFragment({
  fragmentId: 'da-ai-assistant',
  routePatterns: [
    // URL pattern for fetching fragment assets
    '/__fragments/da-ai-assistant/:_*',
    // URL pattern for navigating
    '/',
  ],
  endpoint: 'https://da-ai-assistant.anfibiacreativa.workers.dev',
  onSsrFetchError: () => ({
    response: new Response('<p>AI Assistant not available</p>', {
      headers: { 'content-type': 'text/html' },
      status: 503,
    }),
  }),
});

/**
 * Get the web fragments middleware
 * @param {string} environment - The environment (dev, stage, production)
 * @returns {Function} Middleware function
 */
export function getFragmentsMiddleware(environment = 'production') {
  const mode = environment === 'production' ? 'production' : 'development';
  return getWebMiddleware(gateway, { mode });
}

export { gateway };
