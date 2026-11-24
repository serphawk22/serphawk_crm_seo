import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(path, resolve, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', ...Object.keys(globals), code)(module, module.exports, resolve, ...Object.values(globals));
  return module.exports;
}

const routes = compile('src/lib/authRoutes.ts', name => {
  assert.equal(name, '@/lib/companyConfig');
  return { COMPANY_BASE_DOMAIN: 'serphawk.in' };
});
assert.equal(routes.isPublicPage('/showcase'), true);
assert.equal(routes.isPublicPage('/leads'), false);
assert.equal(routes.isPublicPage('/demo_showcase_missing'), false);

const response = { success: false, ...routes.loginError({ code: 'wrong_company' }, 'Invalid credentials') };
const state = [], effects = [], navigation = [], timers = [];
let cursor = 0, google;
const jsx = (type, props) => ({ type, props });
const imports = name => {
  if (name === 'react') return {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], value => { state[slot] = value; }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
  if (name === '@/lib/authRoutes') return routes;
  if (name === '@/context/RoleContext') return { useRole: () => ({ login: async () => response }) };
  if (name === '@/context/LanguageContext') return { useLanguage: () => ({ t: value => value }) };
  if (name === '@/components/CompanyBoundary') return { useCompanyBrand: () => ({ company: true }) };
  if (name === '@react-oauth/google') return { useGoogleLogin: options => { google = options; return () => {}; } };
  if (name === 'framer-motion') return { motion: { div: 'motion.div' }, AnimatePresence: 'transition' };
  return new Proxy({}, { get: (_, key) => String(key) });
};
const window = { location: { replace: value => navigation.push(value) },
  setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} };
const fetch = async () => new Response(JSON.stringify({ detail: { code: 'wrong_company' } }), { status: 403 });
const { default: Login } = compile('src/app/login/page.tsx', imports, { window, fetch });
function render() { cursor = 0; effects.length = 0; return Login(); }
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

render(); effects.forEach(effect => effect());
const login = render();
assert.ok(find(login, node => node.props?.href === 'https://serphawk.in/signup'));
await find(login, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
const after = render();
assert.match(JSON.stringify(after), /This account belongs to another workspace/);
effects.forEach(effect => effect());
assert.equal(navigation.length, 0, 'The notice appears before redirection');
timers.shift()();
assert.deepEqual(navigation, ['https://serphawk.in/login']);
await google.onSuccess({ access_token: 'mock-token' });
assert.match(JSON.stringify(render()), /This account belongs to another workspace/);
console.log('Company login shows a notice and sends the user to the platform login.');

const sessionStates = [], sessionEffects = [], sessionNavigation = [];
const storage = new Map([['crm_user', JSON.stringify({ id: 1, role: 'Admin' })], ['crm_token', 'test-token']]);
const router = { replace: path => sessionNavigation.push(path) };
let sessionCursor = 0, pathname = '/';
const ref = { current: false };
const { RoleProvider } = compile('src/context/RoleContext.tsx', name => {
  if (name === 'react') return {
    createContext: () => ({ Provider: 'role-provider' }),
    useRef: () => ref,
    useState(initial) {
      const slot = sessionCursor++;
      if (!(slot in sessionStates)) sessionStates[slot] = initial;
      return [sessionStates[slot], value => { sessionStates[slot] = value; }];
    },
    useEffect(effect) { sessionEffects.push(effect); },
  };
  if (name === 'react/jsx-runtime') return { jsx };
  if (name === 'next/navigation') return { useRouter: () => router, usePathname: () => pathname };
  if (name === '@/components/CompanyBoundary') return { useCompanyBrand: () => ({ company: false }) };
  if (name === '@/lib/authRoutes') return routes;
  return {};
}, {
  window: { _fetchPatched: true, location: { replace: path => sessionNavigation.push(path) } },
  localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
});
function session() {
  sessionCursor = 0;
  sessionEffects.length = 0;
  const tree = RoleProvider({ children: null });
  return tree.props.value;
}
session(); sessionEffects[0]();
assert.equal(session().isAuthenticated, true);
session().logout();
assert.equal(session().isAuthenticated, false);
sessionEffects[1]();
assert.deepEqual(sessionNavigation, ['/login'], 'Logout from home must not compete with the showcase redirect');
assert.equal(storage.size, 0);
pathname = '/login';
session(); sessionEffects[1]();
pathname = '/';
session(); sessionEffects[1]();
assert.deepEqual(sessionNavigation, ['/login', '/showcase'], 'A fresh anonymous home visit still opens the showcase');
console.log('Signing out of the home page lands on login without opening the showcase.');
