import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function compile(path, imports, suffix = '', globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8') + suffix, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', ...Object.keys(globals), code)(
    mod, mod.exports, imports, ...Object.values(globals));
  return mod.exports;
}

const routes = compile('src/lib/moduleRoutes.ts', () => { throw new Error('Unexpected import'); });

// Run actual component render/effect handlers with controlled role, feature and
// API responses. No local environment files, credentials or browser are needed.
function harness({ role = 'SuperAdmin', path = '/admin/telemetry', inspection, reducedMotion = false, tenantRows } = {}) {
  const states = [], effects = [], navigated = [], stored = new Map();
  let cursor = 0, mounted = false;
  const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect(effect) { if (!mounted) effects.push(effect); },
    useRef: () => ({ current: null }), useMemo: fn => fn(), useCallback: fn => fn,
  };
  const tenant = { id: 2, name: 'Test Company', business_name: 'Test Company', users: 1, leads: 1,
    clients: 0, modules_on: 1, open_requests: 0, has_logo: false };
  const imports = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === '@/lib/moduleRoutes') return routes;
    if (name === '@/components/FeatureAccessNotice') return compile('src/components/FeatureAccessNotice.tsx', imports);
    if (name === '@/context/RoleContext') return { useRole: () => ({ role, isAuthenticated: true, user: { role } }) };
    if (name === '@/context/TenantConfigContext') return { useTenantConfig: () => ({
      loaded: true, features: { demo_accounts: false }, refresh: () => {}, hasFeature: () => false, isOn: () => false,
    }) };
    if (name === 'next/navigation') return { usePathname: () => path };
    if (name === '@/context/LanguageContext') return { useLanguage: () => ({ t: key => key }) };
    if (name === '@/lib/utils') return { cn: (...values) => values.join(' ') };
    if (name === '@dnd-kit/sortable') return { useSortable: () => ({ attributes: {}, listeners: {} }) };
    if (name === '@dnd-kit/utilities') return { CSS: { Transform: { toString: () => '' } } };
    if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => `motion.${String(key)}` }), AnimatePresence: 'AnimatePresence', useReducedMotion: () => reducedMotion };
    if (name === '@/components/Toasts') return { ToastStack: 'ToastStack', useToasts: () => ({ toasts: [], dismiss() {}, success() {}, error() {} }) };
    if (name === './shared') return {
      call: async url => url.endsWith('/overview')
        ? { tenants: tenantRows ?? [tenant], totals: { clients: 1, paid: 1, trial: 0, demo: 0, users: 1, open_requests: 0 }, total_modules: 1, inspection_enabled: inspection }
        : url.endsWith('/catalog') ? { features: [], presets: [] } : { industries: [], countries: [] },
      displayName: t => t.brand_name || t.business_name || t.name, Badge: 'Badge', ClientAvatar: 'ClientAvatar', inputCls: '', ghostBtn: '', primaryBtn: '',
    };
    return new Proxy({}, { get: (_, key) => String(key) });
  };
  const globals = {
    sessionStorage: { setItem: (key, value) => stored.set(key, value) },
    window: { location: { assign: path => navigated.push(path) } },
  };
  return {
    imports, globals, stored, navigated,
    render(component, props) { cursor = 0; const tree = component(props); mounted = true; return tree; },
    async loaded() { effects.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function nodeText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  return nodeText(node.props?.children);
}

test('client directory list keeps filtering, sorting and per-tenant configuration', async () => {
  const base = { clients: 0, leads: 7, modules_on: 1, open_requests: 0, has_logo: false };
  const tenantRows = [
    { ...base, id: 2, name: 'alpha', business_name: 'Alpha', users: 2, is_trial: false },
    { ...base, id: 3, name: 'beta', business_name: 'Beta', users: 5, is_trial: true },
    { ...base, id: 4, name: 'alpha-demo', business_name: 'Alpha Demo', users: 1, is_trial: true, demo_of_tenant_id: 2 },
  ];
  const h = harness({ tenantRows });
  const page = compile('src/app/superadmin/clients/page.tsx', h.imports, '', h.globals).default;
  const render = () => h.render(page);
  const rowIds = tree => find(tree, node => node.type === 'ul' && node.props?.['aria-label'] === 'Client workspaces')?.props.children.map(node => node.props['aria-labelledby']);
  const filter = label => find(render(), node => node.type === 'button' && 'aria-pressed' in node.props && nodeText(node).startsWith(label));
  render(); await h.loaded();
  assert.deepEqual(rowIds(render()), ['workspace-3', 'workspace-2']);
  filter('Paid').props.onClick();
  assert.deepEqual(rowIds(render()), ['workspace-2']);
  find(render(), node => node.props?.['aria-label'] === 'Configure Alpha').props.onClick();
  assert.ok(find(render(), node => node.props?.tenant?.id === 2));
  find(render(), node => node.props?.['aria-label'] === 'Search clients').props.onChange({ target: { value: 'Beta' } });
  assert.match(nodeText(render()), /No client matches/);
  find(render(), node => node.type === 'button' && nodeText(node) === 'Clear filters').props.onClick();
  assert.deepEqual(rowIds(render()), ['workspace-3', 'workspace-2']);
  find(render(), node => node.props?.['aria-label'] === 'Sort clients').props.onChange({ target: { value: 'name' } });
  assert.deepEqual(rowIds(render()), ['workspace-2', 'workspace-3']);
  filter('Demo workspaces').props.onClick();
  assert.deepEqual(rowIds(render()), ['workspace-4']);
  assert.match(nodeText(render()), /Demo of Alpha/);
});

for (const selected of [null, 2]) {
  test(`SuperAdmin can open demo management with disabled tenant entitlement and selection ${selected}`, () => {
    const h = harness({ selected });
    const gate = compile('src/components/ModuleGate.tsx', h.imports).default;
    assert.equal(h.render(gate, { children: 'demo-management' }).props.children, 'demo-management');
  });
}

test('tenant Admin still respects the demo module entitlement', () => {
  const h = harness({ role: 'Admin' });
  const gate = compile('src/components/ModuleGate.tsx', h.imports).default;
  assert.match(JSON.stringify(h.render(gate, { children: 'demo-management' })), /not enabled yet/);
});

test('SuperAdmin CRM pages require a company Admin login', () => {
  const h = harness({ path: '/leads' });
  const gate = compile('src/components/ModuleGate.tsx', h.imports).default;
  assert.match(JSON.stringify(h.render(gate, { children: 'private-prospects' })), /Use the company Admin account/);
});

test('access notice identifies the feature and expands a testing guide without exposing records', () => {
  const h = harness({ path: '/follow-ups' });
  const gate = compile('src/components/ModuleGate.tsx', h.imports).default;
  const render = () => h.render(gate, { children: 'private-record-content' });
  const initial = render();
  assert.match(JSON.stringify(initial), /Follow-up board/);
  assert.ok(find(initial, node => node.props?.href === '/superadmin/clients'));
  assert.ok(find(initial, node => node.props?.href === '/admin/telemetry'));
  assert.doesNotMatch(JSON.stringify(initial), /private-record-content/);
  let help = find(initial, node => node.type === 'button' && 'aria-expanded' in node.props);
  assert.equal(help.props['aria-expanded'], false);
  help.props.onClick();
  const expanded = render();
  help = find(expanded, node => node.type === 'button' && 'aria-expanded' in node.props);
  assert.equal(help.props['aria-expanded'], true);
  assert.ok(find(expanded, node => node.props?.id === help.props['aria-controls']));
  assert.match(JSON.stringify(expanded), /private browser window/);
  help.props.onClick();
  assert.equal(find(render(), node => node.type === 'button' && 'aria-expanded' in node.props).props['aria-expanded'], false);
});

test('reduced motion disables decorative looping animations', () => {
  const h = harness({ path: '/leads', reducedMotion: true });
  const gate = compile('src/components/ModuleGate.tsx', h.imports).default;
  const tree = h.render(gate, { children: 'private-record-content' });
  assert.equal(find(tree, node => node.props?.animate && Object.values(node.props.animate).some(Array.isArray)), undefined);
});

for (const role of ['SuperAdmin', 'Admin']) {
  test(`demo sidebar entry with disabled entitlement for ${role}`, () => {
    const h = harness({ role });
    const { section } = compile('src/components/Sidebar.tsx', h.imports, '\nexport const section = SortableSection;');
    const tree = h.render(section, { role, section: { id: 'system', heading: null, items: [
      { id: 'item-demo-accounts', name: 'Demo Account Data', href: '/admin/telemetry', icon: 'Users', roles: ['Admin', 'SuperAdmin'] },
    ] }, pathname: '/admin/telemetry', favourites: [], searchQuery: '', isOpen: true });
    if (role === 'SuperAdmin') assert.ok(find(tree, node => node.props?.href === '/admin/telemetry'));
    else assert.equal(tree, null);
  });
}

for (const inspection of [false, undefined, true]) {
  test('workspace controls stay absent even with stale server capability '+inspection, async () => {
    const h = harness({ inspection });
    const page = compile('src/app/superadmin/clients/page.tsx', h.imports, '', h.globals).default;
    h.render(page); await h.loaded();
    const tree = h.render(page);
    assert.equal(find(tree, node => node.type === 'button' && node.props?.children === 'Inspect workspace'), undefined);
    assert.equal(find(tree, node => node.props?.role === 'switch'), undefined);
  });
}
