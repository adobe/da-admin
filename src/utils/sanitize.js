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

/*
 * Sanitises uploaded HTML documents and SVG images.
 *
 * HTML is reduced to the DA document format (the markup @adobe/da-parser `doc2aem` emits and
 * helix-html2md ingests) and SVG to static, script-free graphics. Disallowed markup is stripped.
 * When the sanitised tree equals the parsed upload, the original bytes are kept, so documents
 * saved by the editor are stored unchanged.
 *
 * Self-contained on purpose (no da-admin imports) so it can be reused by api.aem.live.
 */
import { fromHtml } from 'hast-util-from-html';
import { sanitize } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import { find, svg as svgInfo } from 'property-information';

export const MAX_HTML_SIZE = 10 * 1024 * 1024;
export const MAX_SVG_SIZE = 5 * 1024 * 1024;

export class SanitizeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const SAFE_IMAGE_SCHEMES = new Set(['http', 'https']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * Returns the URL scheme, mirroring the WHATWG URL parser's whitespace handling
 * (same rules as helix-html2md `isSafeUrl`).
 * @param {string} url
 * @returns {string|null} lower-cased scheme, or null for relative URLs
 */
function urlScheme(url) {
  // eslint-disable-next-line no-control-regex
  const value = String(url ?? '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '');
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  return match ? match[1].toLowerCase() : null;
}

function isSafeUrl(url, schemes = SAFE_SCHEMES) {
  const scheme = urlScheme(url);
  return scheme === null || schemes.has(scheme);
}

const isElement = (node, tagName) => node?.type === 'element' && (!tagName || node.tagName === tagName);
const isWhitespace = (node) => node?.type === 'text' && !/[^ \t\n\f\r]/.test(node.value);
const element = (tagName, properties = {}, children = []) => ({
  type: 'element', tagName, properties, children,
});
const textContent = (node) => (node.type === 'text' ? node.value : (node.children || []).map(textContent).join(''));

function pick(properties, names) {
  return Object.fromEntries(names
    .filter((name) => properties?.[name] !== undefined && properties[name] !== null)
    .map((name) => [name, properties[name]]));
}

/**
 * Structural equality of two hast trees, ignoring positional info.
 */
function sameTree(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'text' || a.type === 'comment' || a.type === 'raw') return a.value === b.value;
  if (a.type === 'element') {
    if (a.tagName !== b.tagName) return false;
    const pa = a.properties || {};
    const pb = b.properties || {};
    const keys = Object.keys(pa);
    if (keys.length !== Object.keys(pb).length) return false;
    if (keys.some((key) => JSON.stringify(pa[key]) !== JSON.stringify(pb[key]))) return false;
  }
  const ca = a.children || [];
  const cb = b.children || [];
  return ca.length === cb.length && ca.every((child, i) => sameTree(child, cb[i]));
}

// ---------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------

// The tags @adobe/da-parser understands (`isKnownHTMLTag`), plus the document skeleton.
const DA_TAGS = [
  'body', 'header', 'main', 'footer',
  'div', 'p', 'hr', 'br', 'em', 'strong', 's', 'u', 'i', 'b', 'span', 'blockquote',
  'picture', 'source', 'img', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'sup', 'sub',
  'da-loc-added', 'da-loc-deleted', 'da-diff-added', 'da-diff-deleted',
];

// Removed together with their content; any other unknown element is unwrapped.
const HTML_STRIP = [
  'script', 'style', 'template', 'noscript', 'iframe', 'frame', 'frameset', 'noframes',
  'object', 'embed', 'applet', 'noembed', 'xmp', 'plaintext', 'textarea', 'select', 'option',
  'button', 'form', 'svg', 'math', 'title', 'head', 'audio', 'video', 'canvas', 'base', 'link', 'meta',
];

const DIFF_ATTRIBUTES = ['contentEditable'];
const CELL_ATTRIBUTES = ['colSpan', 'rowSpan', 'dataAlign', 'dataValign'];

const HTML_SCHEMA = {
  tagNames: DA_TAGS,
  strip: HTML_STRIP,
  attributes: {
    '*': ['className', 'title', 'dataId', 'dataSectionName', 'dataMdast', 'da-diff-added'],
    a: ['href', 'dataEditAs'],
    img: ['src', 'alt', 'loading', 'width', 'height', 'dataFocalX', 'dataFocalY'],
    source: ['srcSet', 'media', 'type'],
    div: ['dataAlign', 'dataValign'],
    td: CELL_ATTRIBUTES,
    th: CELL_ATTRIBUTES,
    ol: ['start', 'type'],
    'da-loc-added': DIFF_ATTRIBUTES,
    'da-loc-deleted': DIFF_ATTRIBUTES,
    'da-diff-added': DIFF_ATTRIBUTES,
    'da-diff-deleted': DIFF_ATTRIBUTES,
  },
  protocols: {
    href: [...SAFE_SCHEMES],
    src: [...SAFE_IMAGE_SCHEMES],
  },
  ancestors: {},
  required: {},
  clobber: [],
  clobberPrefix: '',
  allowComments: false,
  allowDoctypes: false,
};

const SKELETON = new Set(['body', 'header', 'main', 'footer']);

/**
 * Applies checks hast-util-sanitize cannot express and unwraps misplaced skeleton elements.
 */
function refineContent(node) {
  if (!node.children) return node;
  node.children = node.children.flatMap((child) => {
    if (!isElement(child)) return [child];
    refineContent(child);
    if (SKELETON.has(child.tagName)) return child.children;
    const { srcSet } = child.properties;
    // srcset holds several candidates; each must be an http(s) or relative URL.
    if (srcSet !== undefined && String(srcSet).split(',').some((candidate) => {
      const [url] = candidate.trim().split(/\s+/);
      return !isSafeUrl(url, SAFE_IMAGE_SCHEMES);
    })) delete child.properties.srcSet;
    return [child];
  });
  return node;
}

/**
 * Wraps runs of non-section content of `main` into section divs.
 */
function cleanMain(main) {
  const children = [];
  let section;
  main.children.forEach((child) => {
    if (isElement(child, 'div') || (!section && isWhitespace(child))) {
      section = undefined;
      children.push(child);
      return;
    }
    if (!section) {
      section = element('div');
      children.push(section);
    }
    section.children.push(child);
  });
  return { ...main, properties: {}, children };
}

/**
 * Keeps only `div > div > div` rows of the DA metadata block.
 */
function cleanMetadata(div) {
  const keep = (nodes, test) => nodes.filter((child) => isWhitespace(child) || test(child));
  const children = keep(div.children, (row) => isElement(row, 'div')).map((row) => (
    isElement(row) ? { ...row, children: keep(row.children, (cell) => isElement(cell, 'div')) } : row
  ));
  return { ...div, properties: { className: ['da-metadata'] }, children };
}

const isMetadata = (node) => isElement(node, 'div') && node.properties.className?.includes('da-metadata');

/**
 * Enforces `body > header, main, footer, div.da-metadata`. Header and footer are emptied.
 * Without a `main`, the remaining content becomes the single section of a new `main`.
 */
function cleanBody(body) {
  const children = [];
  const stray = [];
  let hasMain = false;
  let strayIndex = -1;
  sanitize(body, HTML_SCHEMA).children.forEach((child) => {
    if (isWhitespace(child)) {
      children.push(child);
    } else if (isElement(child, 'header') || isElement(child, 'footer')) {
      children.push(element(child.tagName));
    } else if (isElement(child, 'main')) {
      if (!hasMain) children.push(cleanMain(refineContent(child)));
      hasMain = true;
    } else if (isMetadata(child)) {
      children.push(cleanMetadata(refineContent(child)));
    } else {
      if (strayIndex < 0) strayIndex = children.length;
      stray.push(child);
    }
  });
  if (!hasMain && stray.some((child) => !isWhitespace(child))) {
    children.splice(strayIndex, 0, element('main', {}, [refineContent(element('div', {}, stray))]));
  }
  return element('body', {}, children);
}

function cleanHeadChild(child) {
  if (isWhitespace(child)) return child;
  if (!isElement(child)) return null;
  const { properties: props } = child;
  switch (child.tagName) {
    case 'title':
      return element('title', {}, [{ type: 'text', value: textContent(child) }]);
    case 'meta': {
      if (props.charSet !== undefined) {
        return /^utf-8$/i.test(props.charSet) ? element('meta', pick(props, ['charSet'])) : null;
      }
      if ((props.name || props.property) && props.content !== undefined) {
        return element('meta', pick(props, ['name', 'property', 'content']));
      }
      return null;
    }
    case 'link':
      if (props.rel?.length === 1 && props.rel[0] === 'alternate' && props.hrefLang
        && props.href && isSafeUrl(props.href)) {
        return element('link', pick(props, ['rel', 'hrefLang', 'href']));
      }
      return null;
    case 'script': {
      if (props.type !== 'application/ld+json') return null;
      const json = textContent(child);
      try {
        JSON.parse(json);
      } catch {
        return null;
      }
      // '<' only occurs inside JSON strings, where \u003c is equivalent.
      return element('script', { type: props.type }, [{ type: 'text', value: json.replaceAll('<', '\\u003c') }]);
    }
    default:
      return null;
  }
}

function cleanDocument(tree) {
  const html = tree.children.find((child) => isElement(child, 'html'));
  const children = html.children.flatMap((child) => {
    if (isWhitespace(child)) return [child];
    if (isElement(child, 'head')) {
      return [element('head', {}, child.children.map(cleanHeadChild).filter(Boolean))];
    }
    if (isElement(child, 'body')) return [cleanBody(child)];
    return [];
  });
  return {
    type: 'root',
    children: [
      ...tree.children.filter((child) => child.type === 'doctype'),
      element('html', pick(html.properties, ['lang', 'dir']), children),
    ],
  };
}

function serializeDocument(root) {
  const html = root.children.find((child) => isElement(child, 'html'));
  const head = html.children.find((child) => isElement(child, 'head'));
  const body = html.children.find((child) => isElement(child, 'body'));
  const bare = root.children.length === 1 && !Object.keys(html.properties).length
    && !head?.children.some((child) => isElement(child));
  return toHtml(bare ? body : root);
}

/**
 * Sanitises an HTML document to the DA document format.
 * @param {string} text the HTML source
 * @param {Object} [options]
 * @param {boolean} [options.reserialize=false] serialise even when nothing was removed
 * @returns {{text: string, changed: boolean}} sanitised HTML; the input when unchanged
 */
export function sanitizeHtml(text, { reserialize = false } = {}) {
  const tree = fromHtml(text);
  const clean = cleanDocument(tree);
  if (!reserialize && sameTree(tree, clean)) return { text, changed: false };
  const result = serializeDocument(clean);
  // A forced re-serialise is always a change: the caller must relabel the charset as UTF-8.
  return { text: result, changed: reserialize || result !== text };
}

// ---------------------------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------------------------

const SVG_TAGS = [
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'style', 'a', 'image', 'switch', 'view',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
  'feTile', 'feTurbulence',
];

const SVG_STRIP = [
  'script', 'foreignObject', 'animate', 'animateColor', 'animateMotion', 'animateTransform',
  'set', 'mpath', 'handler', 'listener', 'iframe', 'metadata',
];

const SVG_ATTRIBUTES = [
  // core and namespaces
  'id', 'class', 'style', 'lang', 'xml:lang', 'xml:space', 'xmlns', 'xmlns:xlink', 'role',
  'href', 'xlink:href', 'xlink:title', 'version', 'requiredFeatures', 'requiredExtensions', 'systemLanguage',
  // geometry
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'width', 'height',
  'd', 'points', 'pathLength', 'transform', 'viewBox', 'preserveAspectRatio',
  // presentation
  'alignment-baseline', 'baseline-shift', 'clip', 'clip-path', 'clip-rule', 'color',
  'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering',
  'cursor', 'direction', 'display', 'dominant-baseline', 'enable-background', 'fill',
  'fill-opacity', 'fill-rule', 'filter', 'flood-color', 'flood-opacity', 'font-family',
  'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight',
  'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'image-rendering', 'kerning',
  'letter-spacing', 'lighting-color', 'marker-end', 'marker-mid', 'marker-start', 'mask',
  'opacity', 'overflow', 'paint-order', 'pointer-events', 'shape-rendering', 'stop-color',
  'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor',
  'text-decoration', 'text-rendering', 'transform-origin', 'unicode-bidi', 'vector-effect',
  'visibility', 'word-spacing', 'writing-mode', 'mix-blend-mode', 'isolation',
  // paint servers, clipping, masking, markers
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'patternUnits',
  'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient',
  // text
  'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'startOffset', 'method', 'spacing', 'side',
  // filters
  'in', 'in2', 'result', 'stdDeviation', 'operator', 'k1', 'k2', 'k3', 'k4', 'mode', 'type',
  'values', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'kernelMatrix', 'order',
  'divisor', 'bias', 'targetX', 'targetY', 'edgeMode', 'kernelUnitLength', 'preserveAlpha',
  'surfaceScale', 'diffuseConstant', 'specularConstant', 'specularExponent', 'scale',
  'xChannelSelector', 'yChannelSelector', 'radius', 'baseFrequency', 'numOctaves', 'seed',
  'stitchTiles', 'azimuth', 'elevation', 'pointsAtX', 'pointsAtY', 'pointsAtZ',
  'limitingConeAngle', 'z', 'filterUnits', 'primitiveUnits', 'filterRes',
].map((name) => find(svgInfo, name).property);

const SVG_SCHEMA = {
  tagNames: SVG_TAGS,
  strip: SVG_STRIP,
  attributes: { '*': [...SVG_ATTRIBUTES, 'aria*', 'data*'] },
  protocols: {},
  ancestors: {},
  required: {},
  clobber: [],
  clobberPrefix: '',
  allowComments: false,
  allowDoctypes: false,
};

const EXTERNAL_HREF = {
  a: (url) => isSafeUrl(url),
  image: (url) => isSafeUrl(url, SAFE_IMAGE_SCHEMES) || /^data:image\/(png|jpe?g|gif|webp);/i.test(url.trim()),
};
EXTERNAL_HREF.feImage = EXTERNAL_HREF.image;

/**
 * Removes CSS that can load external resources or run script in legacy engines.
 * CSS escapes could hide such constructs, so CSS containing backslashes is dropped.
 * @param {string} css
 * @returns {string} cleaned CSS, empty if it had to be dropped
 */
export function cleanCss(css) {
  let value = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  if (value.includes('\\') || value.includes('/*')) return '';
  value = value
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, url) => (url.trim().startsWith('#') ? match : 'none'));
  if (/url\s*\((?!\s*['"]?#)|image-set\s*\(|expression\s*\(|behavior\s*:|-moz-binding|javascript:|@import/i.test(value)) return '';
  return value;
}

function refineSvg(node, state) {
  node.children = (node.children || []).flatMap((child) => {
    if (!isElement(child)) return [child];
    const { properties: props } = child;
    ['href', 'xLinkHref'].forEach((name) => {
      if (props[name] === undefined) return;
      const url = String(props[name]);
      const allowed = url.trim().startsWith('#') || EXTERNAL_HREF[child.tagName]?.(url);
      if (!allowed) delete props[name];
      else if (name === 'xLinkHref') state.xlink = true;
    });
    if (props.style !== undefined) {
      const style = cleanCss(props.style);
      if (style.trim()) props.style = style;
      else delete props.style;
    }
    if (child.tagName === 'style') {
      const css = cleanCss(textContent(child));
      if (!css.trim()) return [];
      child.properties = pick(props, ['type', 'media']);
      child.children = [{ type: 'raw', value: `<![CDATA[${css.replaceAll(']]>', ']]]]><![CDATA[>')}]]>` }];
      return [child];
    }
    refineSvg(child, state);
    return [child];
  });
  // XML forbids '<' in attribute values, which the HTML serializer leaves unescaped.
  Object.entries(node.properties || {}).forEach(([name, value]) => {
    if (String(value).includes('<')) delete node.properties[name];
  });
  return node;
}

/**
 * Sanitises an SVG image to static, script-free SVG. The result is always re-serialised as
 * XML from the sanitised tree, because the HTML parser used here and the XML parser browsers
 * use for SVG files can disagree on the original bytes (e.g. DTD entity declarations).
 * @param {string} text the SVG source
 * @returns {{text: string, changed: boolean}}
 * @throws {SanitizeError} if the input has no SVG root element
 */
export function sanitizeSvg(text) {
  const tree = fromHtml(text, { fragment: true });
  const root = tree.children.find((child) => isElement(child, 'svg'));
  if (!root) throw new SanitizeError(400, 'Expected an SVG root element.');
  const state = { xlink: false };
  const svg = refineSvg(sanitize(root, SVG_SCHEMA), state);
  svg.properties.xmlns = SVG_NS;
  if (state.xlink) svg.properties.xmlnsXLink = XLINK_NS;
  else delete svg.properties.xmlnsXLink;
  const result = toHtml(svg, {
    space: 'svg', closeEmptyElements: true, allowDangerousHtml: true,
  });
  return { text: result, changed: result !== text };
}

// ---------------------------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------------------------

const KIND_BY_EXT = { html: 'html', svg: 'svg' };
const KIND_BY_TYPE = { 'text/html': 'html', 'image/svg+xml': 'svg' };
const baseType = (type) => String(type || '').split(';')[0].trim().toLowerCase();

/**
 * Determines which sanitiser applies to an upload. Either the extension or the content type
 * selects it, so neither can be used to bypass sanitisation.
 * @param {string} [ext] file extension
 * @param {string} [type] content type
 * @returns {'html'|'svg'|undefined}
 * @throws {SanitizeError} if extension and content type select different sanitisers
 */
export function getSanitizeKind(ext, type) {
  const byExt = KIND_BY_EXT[String(ext || '').toLowerCase()];
  const byType = KIND_BY_TYPE[baseType(type)];
  if (byExt && byType && byExt !== byType) {
    throw new SanitizeError(415, 'Content type does not match the file extension.');
  }
  return byType || byExt;
}

function hasForeignCharset(type) {
  const match = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(String(type || ''));
  return !!match && match[1].toLowerCase() !== 'utf-8';
}

/**
 * Sanitises source text of the given kind.
 * @param {'html'|'svg'} kind
 * @param {string} text
 * @param {Object} [options]
 * @param {string} [options.type] declared content type; a non-UTF-8 charset forces re-serialising
 * @returns {{text: string, changed: boolean}}
 * @throws {SanitizeError} if the source is too large or not valid for its kind
 */
export function sanitizeText(kind, text, { type } = {}) {
  const max = kind === 'svg' ? MAX_SVG_SIZE : MAX_HTML_SIZE;
  if (new TextEncoder().encode(text).byteLength > max) {
    throw new SanitizeError(413, `${kind.toUpperCase()} source exceeds ${max} bytes.`);
  }
  if (kind === 'svg') return sanitizeSvg(text);
  // The original bytes are only kept if browsers decode them exactly as parsed here.
  return sanitizeHtml(text, { reserialize: hasForeignCharset(type) });
}

/**
 * Whether sanitisation is enabled (the DA_SANITIZE=off kill switch disables it).
 * @param {Object} [env]
 * @returns {boolean}
 */
export function isSanitizeEnabled(env) {
  return String(env?.DA_SANITIZE ?? '').toLowerCase() !== 'off';
}

/**
 * Sanitises the data of an upload as parsed by `putHelper`.
 * @param {{data?: File|string, guid?: string}|null|undefined} obj upload
 * @param {{ext?: string}} daCtx request context
 * @param {Object} [env] worker bindings
 * @returns {Promise<{obj: Object, changed: boolean}>} upload with sanitised data
 * @throws {SanitizeError} if the upload must be rejected
 */
export async function sanitizeUpload(obj, daCtx, env) {
  if (!isSanitizeEnabled(env) || !obj?.data) return { obj, changed: false };
  const { data } = obj;
  if (typeof data === 'string') {
    const kind = getSanitizeKind(daCtx.ext);
    if (!kind) return { obj, changed: false };
    const { text, changed } = sanitizeText(kind, data);
    return { obj: changed ? { ...obj, data: text } : obj, changed };
  }
  if (!(data instanceof Blob)) return { obj, changed: false };
  const kind = getSanitizeKind(daCtx.ext, data.type);
  if (!kind) return { obj, changed: false };
  if (data.size > (kind === 'svg' ? MAX_SVG_SIZE : MAX_HTML_SIZE)) {
    throw new SanitizeError(413, `${kind.toUpperCase()} source exceeds the size limit.`);
  }
  const { text, changed } = sanitizeText(kind, await data.text(), { type: data.type });
  if (!changed) return { obj, changed: false };
  const type = data.type.replace(/(;\s*charset\s*=\s*)"?[^";\s]+"?/i, '$1utf-8');
  const file = new File([text], data.name || 'source', { type });
  return { obj: { ...obj, data: file }, changed: true };
}
