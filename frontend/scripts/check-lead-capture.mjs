import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function compile(path, dependencies = {}) {
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => dependencies[name] || require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const attribution = compile('src/lib/leadAttribution.ts');
const now = Date.UTC(2026, 10, 11);
const ad = attribution.captureVisit('?utm_source=google&utm_medium=cpc&email=private@example.test', '/leadformpage', 'https://example.test/path?private=secret', now);
assert.equal(ad.utm_source, 'google');
assert.equal(ad.email, undefined);
assert.equal(ad.referrer, 'https://example.test');
const first = attribution.rememberVisit(null, ad, now);
const direct = attribution.captureVisit('', '/leadformpage', '', now + 1000);
const second = attribution.rememberVisit(first, direct, now + 1000);
assert.deepEqual(second.first, ad);
assert.deepEqual(second.latest_campaign, ad);
assert.equal(second.expires, first.expires, 'direct returns must not extend the fixed retention period');
assert.equal(attribution.activeVisit(second, now + 31 * 86400000), null);
assert.deepEqual(attribution.rememberVisit(second, direct, now + 31 * 86400000).first, direct);
const form = compile('src/components/LeadCaptureForm.tsx', { '@/lib/leadAttribution': attribution, 'next/script': { default: () => null, __esModule: true } }).default;
const html = renderToStaticMarkup(React.createElement(form, { form: { heading: 'Enquire with DaPros', description: 'Contact us', privacy_notice: 'Privacy notice', submit_label: 'Send enquiry', success_message: 'Thank you', fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: false }, { key: 'phone', label: 'Phone', type: 'tel', required: false }] } }));
assert.match(html, /<form/);
assert.match(html, /Enquire with DaPros/);
assert.doesNotMatch(html, /href="\/(login|signup|register)"/);
assert.doesNotMatch(html, /password|sign in|register/i);
// Merely importing the global CRM interceptor must not make the public form
// require localStorage, authentication or its offline request queue.
const previousWindow = globalThis.window;
const calls = [];
globalThis.window = { location: { pathname: '/leadformpage' }, fetch: async (...args) => { calls.push(args); return new Response('{"receipt":"anonymous"}'); } };
try {
  compile('src/context/RoleContext.tsx', { 'next/navigation': {}, '@/config': { API_BASE_URL: '/api/backend' }, '@/lib/apiRequest': { isInternalApi() { throw new Error('Public requests must bypass CRM interception'); } } });
  const response = await window.fetch('/api/lead-capture', { method: 'POST', body: '{}' });
  assert.equal((await response.json()).receipt, 'anonymous');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].headers, undefined, 'public submissions must not gain CRM headers');
} finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
console.log('Public lead form rendering and attribution regression checks passed.');
