import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Exercise the SMTP card THROUGH the actual global session interceptor. Testing
// the card alone misses header normalization bugs in window.fetch.
const source = fs.readFileSync('src/app/admin/settings/components/SMTPSettingsTab.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const roleSource = fs.readFileSync('src/context/RoleContext.tsx', 'utf8');
const roleCompiled = ts.transpileModule(roleSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const apiCompiled = ts.transpileModule(fs.readFileSync('src/lib/apiRequest.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const apiModule = { exports: {} };
new Function('module', 'exports', apiCompiled)(apiModule, apiModule.exports);

function mountCard({ legacyToken, readStatus = 200 } = {}) {
  const store = new Map([
    ['crm_user', JSON.stringify({ id: 7, role: 'Admin', tenant_id: 2 })],
    ['crm_token', 'current-signed-session'],
  ]);
  if (legacyToken) store.set('token', legacyToken);
  const storage = { getItem: key => store.get(key) ?? null, removeItem: key => store.delete(key) };
  const sessionStore = new Map();
  const sessionStorage = { getItem: key => sessionStore.get(key) ?? null, removeItem: key => sessionStore.delete(key) };
  const states = [], effects = [], calls = [];
  let cursor = 0, mounted = false;
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({}),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const configured = { smtp_host: 'smtp.test.invalid', smtp_port: 587, smtp_user: 'mail@test.invalid',
    from_name: 'Test company', from_email: 'mail@test.invalid', has_password: true, encrypted: true };
  const nativeFetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const authorization = headers.get('Authorization');
    const status = authorization === 'Bearer current-signed-session' ? readStatus : 401;
    calls.push({ url, method: init.method || 'GET', authorization, status, headers });
    return new Response(JSON.stringify(status === 200 ? configured : { detail: 'Mailbox settings unavailable' }), { status });
  };
  const imports = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@/config') return { API_BASE_URL: 'https://api.test.invalid' };
    if (name === '@/lib/apiRequest') return apiModule.exports;
    if (name === '@/lib/emailConfirm') return { emailTriggerInfo: () => null };
    if (name === 'next/navigation') return {};
    if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => `motion.${String(key)}` }), AnimatePresence: 'AnimatePresence' };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => `icon.${String(key)}` });
    if (name === '@/components/EmailOTPVerification') return { default: 'EmailOTPVerification' };
    throw new Error(`Unexpected component import: ${name}`);
  };
  const window = { fetch: nativeFetch, location: { origin: 'https://app.test.invalid', pathname: '/admin/branding' } };
  const roleModule = { exports: {} };
  new Function('module', 'exports', 'require', 'window', 'localStorage', 'sessionStorage', 'navigator', roleCompiled)(
    roleModule, roleModule.exports, imports, window, storage, sessionStorage, { onLine: true });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'fetch', 'localStorage', 'setTimeout', compiled)(
    mod, mod.exports, imports, window.fetch, storage, () => 0);
  const render = () => { cursor = 0; return mod.exports.default(); };
  render(); mounted = true;
  return { store, calls, render, request: window.fetch, async loaded() {
    effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
  } };
}

function findButton(node, handler) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map(child => findButton(child, handler)).find(Boolean);
  if (node.type === 'button' && node.props?.onClick?.name === handler) return node;
  return findButton(node.props?.children, handler);
}

for (const legacyToken of [undefined, 'obsolete-session']) {
  test(`opening Branding SMTP settings preserves the CRM session with legacy token ${legacyToken ?? 'absent'}`, async () => {
    const card = mountCard({ legacyToken });
    await card.loaded();
    assert.equal(card.calls[0].status, 200);
    assert.equal(card.calls[0].authorization, 'Bearer current-signed-session');
    assert.ok(card.store.has('crm_user'));
    assert.equal(card.store.get('crm_token'), 'current-signed-session');
  });
}

test('saving SMTP settings uses the same signed CRM session', async () => {
  const card = mountCard({ legacyToken: 'obsolete-session' });
  await card.loaded();
  const button = findButton(card.render(), 'handleSave');
  assert.ok(button);
  await button.props.onClick();
  assert.equal(card.calls.length, 2);
  assert.equal(card.calls[1].method, 'POST');
  assert.equal(card.calls[1].authorization, 'Bearer current-signed-session');
  assert.equal(card.calls[1].status, 200);
  assert.ok(card.store.has('crm_token'));
});

test('a forbidden mailbox panel displays its error without clearing the session', async () => {
  const card = mountCard({ readStatus: 403 });
  await card.loaded();
  assert.ok(card.store.has('crm_token'));
  assert.match(JSON.stringify(card.render()), /Mailbox settings unavailable/);
});

for (const [name, headers] of [
  ['object', { Authorization: 'Bearer obsolete', 'X-Tenant-ID': '3', 'Content-Type': 'application/json' }],
  ['Headers', new Headers({ authorization: 'Bearer obsolete', 'x-tenant-id': '3', 'content-type': 'application/json' })],
  ['tuples', [['authorization', 'Bearer obsolete'], ['x-tenant-id', '3'], ['content-type', 'application/json']]],
]) {
  test(`session interceptor replaces credentials case-insensitively for ${name} headers`, async () => {
    const card = mountCard();
    const response = await card.request('https://api.test.invalid/settings/email', { headers });
    assert.equal(response.status, 200);
    assert.equal(card.calls[0].authorization, 'Bearer current-signed-session');
    assert.equal(card.calls[0].headers.get('X-Tenant-ID'), '2');
    assert.equal(card.calls[0].headers.get('Content-Type'), 'application/json');
    assert.ok(card.store.has('crm_token'));
  });
}

test('Request headers are merged with overrides without duplicate credentials', async () => {
  const card = mountCard();
  const request = new Request('https://api.test.invalid/settings/email', {
    headers: { Authorization: 'Bearer obsolete', 'X-Original': 'retained' },
  });
  const response = await card.request(request, { headers: { 'X-Override': 'retained' } });
  assert.equal(response.status, 200);
  assert.equal(card.calls[0].authorization, 'Bearer current-signed-session');
  assert.equal(card.calls[0].headers.get('X-Original'), 'retained');
  assert.equal(card.calls[0].headers.get('X-Override'), 'retained');
});

test('a genuinely unauthorized signed session still logs out', async () => {
  const card = mountCard({ readStatus: 401 });
  await card.loaded();
  assert.equal(card.calls[0].status, 401);
  assert.ok(!card.store.has('crm_user'));
  assert.ok(!card.store.has('crm_token'));
});
