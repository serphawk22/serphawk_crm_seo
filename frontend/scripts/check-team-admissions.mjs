import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the live directory render, role selection and create handler with
// isolated API responses so a selectable role really reaches account creation.
function harness(institute, members = []) {
  const states = [], effects = [], calls = [];
  let cursor = 0, mounted = false;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
    },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const imports = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === '@/context/RoleContext') return { useRole: () => ({ user: { id: 1, role: 'Admin' } }) };
    if (name === '@/context/LanguageContext') return { useLanguage: () => ({ t: key => key }) };
    if (name === '@/config') return { API_BASE_URL: 'https://api.test' };
    if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => `motion.${String(key)}` }), AnimatePresence: 'AnimatePresence' };
    return new Proxy({}, { get: (_, key) => String(key) });
  };
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ users: members }) };
  };
  const code = ts.transpileModule(fs.readFileSync('src/app/teams/page.tsx', 'utf8') + '\nexport { StandardTeamsPage };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'fetch', code)(mod, mod.exports, imports, fetch);
  return {
    calls,
    render() { cursor = 0; const tree = mod.exports.StandardTeamsPage({ institute }); mounted = true; return tree; },
    async load() { effects.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node !== 'object') return String(node);
  return text(node.props?.children);
}
for (const institute of [false, true]) {
  const h = harness(institute, [{ id: 2, role: 'Admissions', name: 'Admissions Specialist', email: 'admissions@team.test' }]);
  h.render(); await h.load();
  let tree = h.render();
  assert.equal(Boolean(find(tree, node => node.props?.id === 'admissions-team-heading')), institute, 'Admissions roster is institute-only');
  if (institute) assert.ok(text(tree).includes('admissions@team.test'), 'Admissions accounts remain visible after creation');
  find(tree, node => node.type === 'button' && text(node).includes('teams.add_member')).props.onClick();
  tree = h.render();
  assert.equal(Boolean(find(tree, node => node.type === 'option' && node.props.value === 'Admissions')), institute, 'Admissions is selectable for institute accounts');
  if (institute) {
    for (const [id, value] of [['member-name', 'New Admissions'], ['member-email', 'new@team.test'], ['member-password', 'safe-password'], ['member-role', 'Admissions']]) {
      find(tree, node => node.props?.id === id).props.onChange({ target: { value } });
    }
    tree = h.render();
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    const request = h.calls.find(call => call.init.method === 'POST');
    assert.equal(request.url, 'https://api.test/users');
    assert.deepEqual(JSON.parse(request.init.body), { name: 'New Admissions', email: 'new@team.test', password: 'safe-password', role: 'Admissions' });
  }
}
console.log('Team Directory Admissions visibility, role selection and account-creation checks passed.');
