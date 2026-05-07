/*!
 * Copyright 2026 KT AI
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fetch from 'node-fetch';
import { WA_URL, WA_USER_AGENT } from './constants';

export async function fetchLatestAlphaZh(): Promise<string> {
  const response = await fetch(`${WA_URL}`, {
    headers: {
      'user-agent': WA_USER_AGENT,
      'accept-language': 'zh-CN,zh;q=1,en;q=0.8',
      'sec-fetch-mode': 'navigate',
      cookie: 'wa_lang_pref=zh_CN; wa_web_lang_pref=zh_CN; wa_build=c',
      pragma: 'no-cache',
      'cache-control': 'no-cache',
    },
  });

  return await response.text();
}
