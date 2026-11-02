import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function harness(role, tab = 'profile') {
  const states = [], effects = [], calls = [], updated = [];
  let cursor = 0, mounted = false, loggedOut = false;
  const user = { id: 7, name: 'Initial', role };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const slot = cursor++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial; return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const imports = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@/context/RoleContext') return { useRole: () => ({ user, role, logout: () => { loggedOut = true; }, updateProfile: value => updated.push(value) }) };
    if (name === '@/context/TenantConfigContext') return { useTenantConfig: () => ({ hasFeature: () => true }) };
    if (name === 'next/navigation') return { useRouter: () => ({ replace() {} }), useSearchParams: () => new URLSearchParams({ tab }) };
    if (name === '@/config') return { API_BASE_URL: 'https://api.test' };
    if (name === '@/lib/phone') return { isPlausiblePhone: () => true };
    return new Proxy({}, { get: (_, key) => String(key) });
  };
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ user: { id: 7, name: 'Saved name', phone: '+15551234567', email: 'user@test.invalid', role } }) };
  };
  const code = ts.transpileModule(fs.readFileSync('src/app/settings/page.tsx', 'utf8') + '\nexport { SettingsContent };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'fetch', code)(mod, mod.exports, imports, fetch);
  return {
    calls, updated, states, get loggedOut() { return loggedOut; },
    render() { cursor = 0; const tree = mod.exports.SettingsContent(); mounted = true; return tree; },
    async load() { effects.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(value => find(value, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
for (const role of ['Admin', 'SalesManager', 'SuperAdmin']) {
  const h = harness(role, 'company');
  const tree = h.render();
  const company = find(tree, node => node.type === 'CompanySettingsPanel');
  assert.equal(Boolean(company), role === 'Admin', 'Only tenant Admins mount company controls');
}
const profile = harness('SalesManager');
profile.render(); await profile.load();
let tree = profile.render();
assert.ok(find(tree, node => node.type === 'form'));
await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
assert.equal(profile.calls.at(-1).url, 'https://api.test/users/me');
assert.equal(profile.calls.at(-1).init.method, 'PUT');
assert.deepEqual(profile.updated, [{ name: 'Saved name', phone: '+15551234567' }]);
const security = harness('SalesManager', 'security');
security.render(); await security.load();
security.states[1] = { current: 'old-secret', next: 'new-secret-123', confirm: 'new-secret-123' };
tree = security.render();
await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
assert.equal(security.calls.at(-1).url, 'https://api.test/change-password');
assert.equal(JSON.parse(security.calls.at(-1).init.body).user_id, 7);
assert.equal(security.loggedOut, true);
console.log('Profile/settings role visibility and live save-handler checks passed.');
