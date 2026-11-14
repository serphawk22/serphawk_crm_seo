import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Render the real boundary while navigating from login into the CRM, using
// the same loaded company context that previously kept the public header visible.
function mount(company = true) {
  const states = [], effects = [];
  let cursor = 0, mounted = false, path = '/login';
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: 'CompanyProvider' }),
    useState(initial) {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], value => { states[slot] = value; }];
    },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const imports = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'next/navigation') return { usePathname: () => path };
    if (name === '@/lib/companyConfig') return { COMPANY_DOMAINS_ENABLED: true };
    return new Proxy({}, { get: (_, key) => String(key) });
  };
  const brand = { company, brand_name: 'DaPros', primary_color: '#123456', locale: 'en' };
  const fetch = async () => ({ ok: true, json: async () => brand });
  const document = { documentElement: {} };
  const window = { dispatchEvent() {} };
  const CustomEvent = class {};
  const code = ts.transpileModule(fs.readFileSync('src/components/CompanyBoundary.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', 'fetch', 'document', 'window', 'CustomEvent', code)(
    module, module.exports, imports, fetch, document, window, CustomEvent);
  return {
    brand,
    render(nextPath = path) {
      path = nextPath; cursor = 0;
      const tree = module.exports.default({ children: 'page-content' });
      mounted = true;
      return tree;
    },
    async load() {
      effects.forEach(effect => effect());
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

const boundary = mount();
boundary.render(); await boundary.load();
for (const path of ['/login', '/signup', '/register', '/forgot-password', '/reset-password', '/p/secret-share']) {
  const tree = boundary.render(path);
  assert.ok(find(tree, node => node.type === 'header'), path);
  assert.ok(find(tree, node => node.type === 'a' && node.props.href === '/leadformpage'), path);
}
for (const path of ['/', '/leads', '/leads/1', '/reports', '/teams', '/settings', '/learning', '/teaching', '/superadmin/clients']) {
  const tree = boundary.render(path);
  assert.equal(find(tree, node => node.type === 'header'), undefined, `No public header above the ${path} application shell`);
  assert.equal(find(tree, node => node.props?.href === '/leadformpage'), undefined);
  assert.equal(tree.props.value, boundary.brand, 'CRM retains the company branding context');
  assert.ok(find(tree, node => Array.isArray(node.props?.children) && node.props.children.includes('page-content')), 'Page content still renders');
}
const publicForm = boundary.render('/leadformpage');
assert.ok(find(publicForm, node => node.type === 'header'));
assert.equal(find(publicForm, node => node.type === 'a' && node.props.href === '/leadformpage'), undefined);
assert.ok(find(publicForm, node => node.type === 'span' && node.props.children === 'Open for enquiries'));

const platform = mount(false);
platform.render(); await platform.load();
assert.equal(find(platform.render('/login'), node => node.type === 'header'), undefined);
console.log('Company header: public entry pages retain enquiries, CRM routes retain branding without the public banner.');
