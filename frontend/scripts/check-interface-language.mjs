import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { translate } from './helpers/translation.mjs';

// Render real component functions with local fixtures. Effects never run: no API,
// mailbox, browser session or customer data is needed for these language checks.
function renderer(language, fixtures = {}) {
  const cache = new Map();
  const jsx = (type, props) => ({ type, props });
  const user = { id: 1, name: 'Customer Name', role: 'Admin' };
  const empty = () => null;
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    let cursor = 0;
    const react = { useState(initial) { const slot = cursor++; return [fixtures[file]?.[slot] ?? (typeof initial === 'function' ? initial() : initial), () => {}]; },
      useEffect() {}, useCallback: fn => fn, useMemo: fn => fn(), useRef: value => ({ current: value }), useId: () => 'fixture-id' };
    const imports = name => {
      if (name === 'react') return { ...react, default: react };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'react-i18next') return { useTranslation: () => ({ i18n: { language } }) };
      if (name === '@/context/LanguageContext') return { useLanguage: () => ({ language, t: (key, values) => translate(key, language, values) }) };
      if (name === '@/context/RoleContext') return { useRole: () => ({ user, role: user.role, email: 'customer@test.invalid' }) };
      if (name === '@/context/TenantConfigContext') return { useTenantConfig: () => ({ settings: { brand_name: 'Customer Brand' }, loaded: true, hasFeature: () => true, isOn: () => false }) };
      if (name === '@/components/DashboardSection') return { useDashboardSections: () => () => true, default: ({ children }) => children };
      if (name === '@/lib/translate') return { translate };
      if (name === '@/lib/utils') return { cn: (...args) => args.join(' ') };
      if (name === '@/i18n/config') return { formatCurrency: n => String(n) };
      if (name === '@/config') return { API_BASE_URL: 'https://api.test.invalid' };
      if (name === 'next/link') return { default: 'a' };
      if (name === 'next/navigation') return { useRouter: () => ({ replace() {} }), usePathname: () => '/' };
      if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => String(key) }), AnimatePresence: 'fragment', useReducedMotion: () => true };
      if (name === 'lucide-react') return new Proxy({}, { get: () => empty });
      if (name === 'recharts') return new Proxy({}, { get: () => ({ children, name }) => [name, children] });
      if (name === '@hello-pangea/dnd') return new Proxy({}, { get: () => ({ children }) => typeof children === 'function' ? children({ innerRef() {}, droppableProps: {}, draggableProps: {}, dragHandleProps: {} }) : children });
      if (name.endsWith('.css')) return {};
      if (name.startsWith('@/components/') || name.startsWith('./') || name === '@/lib/dashboardLocale') {
        const target = name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(file), name);
        return load(target + (fs.existsSync(target + '.tsx') ? '.tsx' : '.ts'));
      }
      return new Proxy({}, { get: () => empty });
    };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', code)(imports, mod, mod.exports);
    for (const [key, value] of Object.entries(mod.exports)) {
      if (typeof value === 'function') mod.exports[key] = (...args) => { cursor = 0; return value(...args); };
    }
    cache.set(file, mod.exports);
    return mod.exports;
  }
  function text(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (typeof node !== 'object') return String(node);
    if (typeof node.type === 'function') return text(node.type(node.props));
    return text(node.props?.children);
  }
  return { load, render: (file, key = 'default', props = {}) => text(load(file)[key](props)) };
}

for (const language of ['es', 'en']) {
  const r = renderer(language, {
    'src/components/DeveloperDashboard.tsx': { 0: [{ id: 1, project_id: 5, task: 'Customer ticket', current_state: 'Planning' }], 1: [{ id: 5, name: 'Customer project' }] },
    'src/components/OnboardingChecklist.tsx': { 0: { completed: 0, total: 1, percent: 0, items: [{ key: 'brand', title: 'Add your company name', done: false, optional: false, link: '/settings' }] } },
    'src/components/CommandCenter.tsx': { 1: { attention: [{ key: 'overdue_tasks', label: 'Overdue tasks', count: 1 }], pipeline: { by_stage: [{ name: 'Negotiation', count: 1, value: 100 }] }, proposals: { recent: [] } }, 2: false },
    'src/components/followups/FollowUpsWidget.tsx': { 0: { overdue: 1, today: 2, pending: 3, completed_7d: 4 }, 1: [], 2: 'ok' },
    'src/app/admin/branding/page.tsx': { 5: { industries: [], countries: [{ code: 'ES', name: 'Spain' }] }, 8: false },
  });
  const check = (content, labels) => { for (const label of labels) assert.ok(content.includes(translate(label, language)), `${language}: rendered ${label}`); };
  let content = r.render('src/components/SalesManagerDashboard.tsx', 'SalesManagerDashboard', { name: 'Customer Name', stats: { metrics: {}, recent_activity: [] } });
  check(content, ['Your sales workspace', 'Assigned Leads', 'Assigned Contacts', 'No data recorded yet', 'Completed (7d)']);
  assert.ok(content.includes('Customer Name'));
  content = r.render('src/components/OperationsDashboard.tsx', 'default', { stats: { operations: { leadStages: [{ name: 'New', value: 1 }], projectProgress: [{ id: 1, name: 'Customer project', status: 'Planning', progress: 10 }] } }, callPitch: null });
  check(content, ['admin_dashboard.financial_overview', 'admin_dashboard.team_engagement', 'Planning']);
  assert.ok(content.includes('Customer project'));
  check(r.render('src/components/DeveloperDashboard.tsx', 'DeveloperDashboard'), ['Planning', 'In Dev', 'Given to QA', 'Prod Release']);
  check(r.render('src/components/DemoDashboard.tsx', 'DemoDashboard', { NAV_CARDS: [], language }), ['Sandbox Environment', 'Explore Platform Features']);
  check(r.render('src/components/OnboardingChecklist.tsx'), ['Get your workspace ready', 'Add your company name']);
  check(r.render('src/components/CommandCenter.tsx'), ['Dashboard', 'Overdue tasks', 'Negotiation', 'No pending follow-ups']);
  check(r.render('src/components/FeatureAccessNotice.tsx', 'default', { feature: 'Invoices', kind: 'module' }), ['Back to dashboard', 'What can I do next?']);
  content = r.render('src/components/GlobalFooter.tsx');
  check(content, ['Contact Dev', 'Contact Admin']);
  assert.ok(content.includes('Customer Brand') && content.includes('Varshith Rallabandi'));
  content = r.render('src/app/admin/branding/page.tsx', 'CompanySettingsPanel');
  check(content, ['Company profile and settings', 'Company / brand name', 'Time zone', 'Lead statuses', 'Payment details']);
  assert.ok(content.includes(language === 'es' ? 'España' : 'Spain'));
  const { dashboardDateLabel } = r.load('src/lib/dashboardLocale.ts');
  assert.equal(dashboardDateLabel('Nov 03', language), language === 'es' ? '3 nov' : 'Nov 03');
  assert.equal(dashboardDateLabel('2026-11', language), language === 'es' ? 'nov 2026' : '2026-11');
  assert.equal(dashboardDateLabel('Customer project', language), 'Customer project');
  assert.equal(dashboardDateLabel('Marching', language), 'Marching');
}
assert.equal(translate('Pending Follow-ups ({{value0}})', 'es', { value0: 17 }), 'Seguimientos pendientes (17)');
assert.equal(translate('Pending Follow-ups ({{value0}})', 'en', { value0: 17 }), 'Pending Follow-ups (17)');
assert.equal(translate('Unknown {{field}}', 'es'), 'Unknown {{field}}');

// Guard the dashboard and the screenshot's settings surfaces against new raw
// English labels, including copy that is hidden behind dialogs or error paths.
const surfaces = ['src/app/page.tsx', 'src/app/settings/page.tsx', 'src/app/admin/branding/page.tsx', 'src/app/admin/settings/components/SMTPSettingsTab.tsx',
  ...['AdminDashboard', 'ClientDashboard', 'DeveloperDashboard', 'DemoDashboard', 'SalesManagerDashboard', 'OperationsDashboard', 'CommandCenter', 'PageGuide', 'FeatureAccessNotice', 'LeadWebhookCard', 'OnboardingChecklist', 'GlobalFooter', 'EmailOTPVerification', 'PhoneInput', 'SalesAccessSettings', 'followups/FollowUpsWidget', 'followups/followupUi', 'analytics/kit'].map(name => `src/components/${name}.tsx`)];
const technical = new Set(['SERP Hawk', 'CRM', 'X-API-Key', 'Varshith Rallabandi', 'V K Anjali', 'Gaurav Mehta', 'Brajesh Kumar', 'd', 's', 'Normal']);
let labels = 0;
for (const file of surfaces) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function translated(key) {
    if (!/[A-Za-z]/.test(key) || technical.has(key)) return;
    assert.notEqual(translate(key, 'es'), key, `${file}: missing Spanish copy for ${key}`);
    labels++;
  }
  function visit(node) {
    if (ts.isJsxText(node)) {
      const copy = node.text.replace(/&[A-Za-z]+;/g, '').trim();
      assert.ok(!/[A-Za-z]/.test(copy) || technical.has(copy), `${file}: unmarked English JSX: ${copy}`);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) translated(node.arguments[0].text);
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'LocalizedText') {
      const attr = node.attributes.properties.find(a => a.name?.text === 'text');
      const expr = attr?.initializer && (ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer);
      if (expr && ts.isStringLiteral(expr)) translated(expr.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
console.log(`Dashboard/settings source coverage: ${labels} translated labels checked.`);
const sidebar = ts.createSourceFile('Sidebar.tsx', fs.readFileSync('src/components/Sidebar.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const overrides = {};
function sidebarKeys(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sidebar) === 'ITEM_KEY_OVERRIDES') {
    for (const property of node.initializer.properties) overrides[property.name.text] = property.initializer.text;
  }
  ts.forEachChild(node, sidebarKeys);
}
sidebarKeys(sidebar);
function sidebarLabels(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const id = node.properties.find(p => p.name?.text === 'id')?.initializer?.text;
    if (id?.startsWith('item-')) {
      const key = `sidebar.${overrides[id] || id.slice(5).replace(/-/g, '_')}`;
      assert.notEqual(translate(key, 'es'), key, `Missing sidebar label: ${key}`);
      assert.notEqual(translate(key, 'en'), key, `Missing English sidebar label: ${key}`);
    }
  }
  ts.forEachChild(node, sidebarLabels);
}
sidebarLabels(sidebar);
console.log('Populated/empty role dashboards, shell, dates, language switching and interpolation checks passed.');
