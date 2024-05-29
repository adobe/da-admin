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
import getDaCtx from './utils/daCtx.js';
import daResp from './utils/daResp.js';

import headHandler from './handlers/head.js';
import getHandler from './handlers/get.js';
import postHandler from './handlers/post.js';
import deleteHandler from './handlers/delete.js';
import unkownHandler from './handlers/unkown.js';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return daResp({ status: 204 });

    const daCtx = await getDaCtx(req, env);
    const { authorized, key } = daCtx;
    if (!authorized) return daResp({ status: 401 });
    if (key?.startsWith('.da-versions')) return daResp({ status: 404 });

    let respObj;
    switch (req.method) {
      case 'HEAD':
        respObj = await headHandler({ env, daCtx });
        break;
      case 'GET':
        respObj = await getHandler({ env, daCtx });
        break;
      case 'PUT':
        respObj = await postHandler({ req, env, daCtx });
        break;
      case 'POST':
        respObj = await postHandler({ req, env, daCtx });
        break;
      case 'DELETE':
        respObj = await deleteHandler({ req, env, daCtx });
        break;
      default:
        respObj = unkownHandler();
    }

    return daResp(respObj);
  },
};
