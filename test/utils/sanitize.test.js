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
import assert from 'node:assert';
import * as Y from 'yjs';
import { aem2doc, doc2aem, EMPTY_DOC } from '@adobe/da-parser';
import {
  MAX_HTML_SIZE,
  SanitizeError,
  cleanCss,
  getSanitizeKind,
  sanitizeHtml,
  sanitizeSvg,
  sanitizeText,
  sanitizeUpload,
} from '../../src/utils/sanitize.js';

const RICH_DOC = `<body><header></header><main><div><h1>Title</h1>
<p>a <a href="https://x.com" title="t">link</a> <a href="mailto:a@b.c">m</a> <a href="/rel#x">r</a> <sup>1</sup><sub>2</sub><u>u</u><s>s</s><em>e</em><strong>b</strong></p>
<picture><source srcset="./media_1.png"><img src="./media_1.png" alt="x" data-focal-x="1" data-focal-y="2"></picture>
<a href="https://a.com/img.png" title="cap" data-edit-as="image">https://a.com/img.png</a>
<div class="columns dark"><div><div data-align="center" data-valign="middle">c1</div><div>c2</div></div></div>
<ul><li>a</li></ul><ol start="3"><li>b</li></ol><pre><code>const x = 1 &lt; 2;</code></pre><blockquote><p>q</p></blockquote><hr>
<table><tr><td colspan="2">t</td></tr></table>
<p><a href="https://y.com"><picture><img src="https://y.com/i.png"></picture></a></p></div>
<div data-section-name="two"><p>s2</p></div></main><footer></footer>
<div class="da-metadata"><div><div>title</div><div>Meta title</div></div></div></body>`;

function collabRoundTrip(html) {
  const ydoc = new Y.Doc();
  aem2doc(html, ydoc);
  return doc2aem(ydoc);
}

const EXECUTABLE = /<script|<iframe|<object|<embed|<svg|<math|<style|<noscript|<template|\son[a-z]+=|javascript:|vbscript:|data:text|srcdoc|formaction/i;

describe('sanitize', () => {
  describe('collab output is left untouched', () => {
    [
      ['rich document', RICH_DOC],
      ['empty document', EMPTY_DOC],
      ['diff markers', '<body><header></header><main><div><da-diff-added><p>new</p></da-diff-added><da-diff-deleted><p>old</p></da-diff-deleted></div></main><footer></footer></body>'],
    ].forEach(([name, html]) => {
      it(`keeps the exact bytes of a ${name}`, () => {
        const saved = collabRoundTrip(html);
        const { text, changed } = sanitizeHtml(saved);
        assert.strictEqual(changed, false);
        assert.strictEqual(text, saved);
      });
    });

    it('keeps the empty document within the restore point threshold', () => {
      const saved = collabRoundTrip(EMPTY_DOC);
      assert.strictEqual(sanitizeHtml(saved).text, saved);
    });
  });

  describe('HTML XSS vectors', () => {
    const wrap = (s) => `<body><header></header><main><div>${s}</div></main><footer></footer></body>`;
    [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<p onclick="alert(1)" style="background:url(javascript:alert(1))">x</p>',
      '<a href="javascript:alert(1)">x</a>',
      '<a href="jav&#x09;ascript:alert(1)">x</a>',
      '<a href="  JaVaScRiPt:alert(1)">x</a>',
      '<a href="vbscript:msgbox(1)">x</a>',
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
      '<img src="data:text/html;base64,PHNjcmlwdD4=">',
      '<picture><source srcset="javascript:alert(1) 1x"><img src="/a.png"></picture>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<object data="x.swf"></object><embed src="x.swf">',
      '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>',
      '<svg><script>alert(1)</script></svg>',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
      '<template><script>alert(1)</script></template>',
      '<form><button formaction="javascript:alert(1)">x</button></form>',
      '<!--><script>alert(1)</script>-->',
      '<![CDATA[><script>alert(1)</script>]]>',
      '<style>@import "https://evil";</style>',
      '<custom-el onmouseover="alert(1)">text</custom-el>',
      '<p id="x" name="cookie">clobber</p>',
    ].forEach((vector) => {
      it(`neutralises ${vector}`, () => {
        const { text, changed } = sanitizeHtml(wrap(vector));
        assert.strictEqual(changed, true);
        assert.doesNotMatch(text, EXECUTABLE);
        assert.doesNotMatch(text, /\sid=|\sname=/);
      });
    });

    it('keeps text of unknown elements', () => {
      const { text } = sanitizeHtml(wrap('<custom-el onmouseover="alert(1)">text</custom-el>'));
      assert.match(text, /<div>text<\/div>/);
    });
  });

  describe('HTML structure', () => {
    it('wraps a fragment without main into a section', () => {
      const { text, changed } = sanitizeHtml('<h1>Hi</h1><p>there</p>');
      assert.strictEqual(changed, true);
      assert.strictEqual(text, '<body><main><div><h1>Hi</h1><p>there</p></div></main></body>');
    });

    it('wraps stray main content into sections and empties header and footer', () => {
      const { text } = sanitizeHtml('<body><header><nav>n</nav></header><main><p>a</p><div><p>b</p></div></main><footer>f</footer></body>');
      assert.strictEqual(text, '<body><header></header><main><div><p>a</p></div><div><p>b</p></div></main><footer></footer></body>');
    });

    it('drops content outside main when a main exists and keeps metadata', () => {
      const { text } = sanitizeHtml('<body><p>stray</p><main><div>x</div></main><div class="da-metadata"><div><div>k</div><div>v</div></div></div></body>');
      assert.doesNotMatch(text, /stray/);
      assert.match(text, /<div class="da-metadata"><div><div>k<\/div><div>v<\/div><\/div><\/div>/);
    });

    it('keeps the safe head subset', () => {
      const html = '<!DOCTYPE html><html lang="en" onload="x"><head><title>T</title><meta charset="utf-8"><meta name="description" content="d">'
        + '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><link rel="alternate" hreflang="de" href="https://x.com/de"><link rel="stylesheet" href="https://evil">'
        + '<script type="application/ld+json">{"a":1</script><script type="application/ld+json">{"name":"x</b>"}</script>'
        + '<base href="https://evil"></head><body><main><div>x</div></main></body></html>';
      const { text } = sanitizeHtml(html);
      assert.match(text, /^<!doctype html><html lang="en"><head>/i);
      assert.match(text, /<title>T<\/title>/);
      assert.match(text, /<meta name="description" content="d">/);
      assert.match(text, /<link rel="alternate" hreflang="de" href="https:\/\/x.com\/de">/);
      assert.match(text, /\{"name":"x\\u003c\/b>"\}/);
      assert.doesNotMatch(text, /refresh|stylesheet|<base|onload|"a":1/);
    });

    it('drops head scripts that break out of JSON-LD', () => {
      const { text } = sanitizeHtml('<head><script type="application/ld+json">{"a":"</script><script>alert(1)</script>"}</script></head><body><main><div>x</div></main></body>');
      assert.doesNotMatch(text, EXECUTABLE);
    });

    it('re-serialises when the declared charset is not UTF-8', () => {
      const html = '<body><main><div>x</div></main></body>';
      assert.strictEqual(sanitizeHtml(html).changed, false);
      assert.strictEqual(sanitizeText('html', html, { type: 'text/html; charset=utf-7' }).changed, true);
    });
  });

  describe('SVG', () => {
    it('strips scripts, handlers, animation and external references', () => {
      const svg = '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">'
        + '<script>alert(1)</script><foreignObject><div onclick="alert(1)">html</div></foreignObject>'
        + '<a xlink:href="javascript:alert(1)"><text>x</text></a><animate attributeName="href" to="javascript:alert(1)"/>'
        + '<set attributeName="onmouseover" to="alert(1)"/><use href="https://evil/x.svg#a"/><use href="#ok"/>'
        + '<image href="data:image/png;base64,AAAA"/><image href="data:image/svg+xml,&lt;svg onload=alert(1)&gt;"/></svg>';
      const { text, changed } = sanitizeSvg(svg);
      assert.strictEqual(changed, true);
      assert.doesNotMatch(text, /script|onload|onclick|foreignObject|html|javascript|animate|<set|evil|ENTITY|svg\+xml/i);
      assert.match(text, /<use href="#ok" \/>/);
      assert.match(text, /<image href="data:image\/png;base64,AAAA" \/>/);
      assert.match(text, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    });

    it('rejects input without an svg root', () => {
      assert.throws(() => sanitizeSvg('<p>no svg</p>'), (e) => e instanceof SanitizeError && e.status === 400);
    });

    it('cleans CSS but keeps fragment references', () => {
      assert.strictEqual(cleanCss('.a{fill:url(#g)} .b{background:url(http://x/y.png)}'), '.a{fill:url(#g)} .b{background:none}');
      assert.strictEqual(cleanCss('@import url(https://evil);.a{fill:red}'), '.a{fill:red}');
      assert.strictEqual(cleanCss('.a{background:u\\72l(https://evil)}'), '');
      assert.strictEqual(cleanCss('.a{x:expression(alert(1))}'), '');
      const { text } = sanitizeSvg('<svg><style>.a{fill:url(#g)}</style><rect class="a" style="fill:url(#g)"/></svg>');
      assert.match(text, /<style><!\[CDATA\[\.a\{fill:url\(#g\)\}\]\]><\/style>/);
    });
  });

  describe('uploads', () => {
    it('picks the sanitiser by extension or type and rejects mismatches', () => {
      assert.strictEqual(getSanitizeKind('html'), 'html');
      assert.strictEqual(getSanitizeKind('json', 'text/html; charset=utf-8'), 'html');
      assert.strictEqual(getSanitizeKind('svg', 'application/octet-stream'), 'svg');
      assert.strictEqual(getSanitizeKind('json', 'application/json'), undefined);
      assert.throws(() => getSanitizeKind('svg', 'text/html'), (e) => e.status === 415);
    });

    it('sanitises file and string uploads and keeps the guid', async () => {
      const data = new File(['<p onclick="x">a</p>'], 'blob', { type: 'text/html; charset=iso-8859-1' });
      const { obj, changed } = await sanitizeUpload({ data, guid: 'g' }, { ext: 'html' }, {});
      assert.strictEqual(changed, true);
      assert.strictEqual(obj.guid, 'g');
      assert.strictEqual(obj.data.type, 'text/html; charset=utf-8');
      assert.doesNotMatch(await obj.data.text(), /onclick/);

      const str = await sanitizeUpload({ data: '<p onclick="x">a</p>' }, { ext: 'html' }, {});
      assert.strictEqual(str.obj.data, '<body><main><div><p>a</p></div></main></body>');
    });

    it('returns the same upload when nothing changed or for other types', async () => {
      const html = new File([collabRoundTrip(RICH_DOC)], 'blob', { type: 'text/html' });
      const upload = { data: html };
      assert.strictEqual((await sanitizeUpload(upload, { ext: 'html' }, {})).obj, upload);
      const json = { data: new File(['{"a":"<script>"}'], 'blob', { type: 'application/json' }) };
      assert.strictEqual((await sanitizeUpload(json, { ext: 'json' }, {})).obj, json);
    });

    it('rejects oversized documents', async () => {
      const data = new File([' '.repeat(MAX_HTML_SIZE + 1)], 'blob', { type: 'text/html' });
      await assert.rejects(sanitizeUpload({ data }, { ext: 'html' }, {}), (e) => e.status === 413);
    });

    it('can be switched off', async () => {
      const upload = { data: '<script>alert(1)</script>' };
      const { obj, changed } = await sanitizeUpload(upload, { ext: 'html' }, { DA_SANITIZE: 'off' });
      assert.strictEqual(obj, upload);
      assert.strictEqual(changed, false);
    });
  });
});
