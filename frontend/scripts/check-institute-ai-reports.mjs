import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('src/components/InstituteAiReports.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount(enabled = true, fail = false) {
  let cursor = 0, mounted = false;
  const state = [], effects = [], requests = [];
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const slot = cursor++; if (!(slot in state)) state[slot] = initial;
      return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }]; },
    useRef(initial) { const slot = cursor++; return state[slot] ||= { current: initial }; },
    useEffect(effect) { if (!mounted) effects.push(effect); },
  };
  const imports = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@/context/TenantConfigContext') return { useTenantConfig: () => ({ isOn: () => enabled, settings: { default_currency: 'MXN' } }) };
    if (name === '@/config') return { API_BASE_URL: '/api/backend' };
    return new Proxy({}, { get: (_, key) => String(key) });
  };
  const fetch = async (url, init = {}) => {
    requests.push({ url, ...init });
    return new Response(JSON.stringify(init.method === 'POST'
      ? fail ? { detail: { message: 'Demo AI limit reached' } } : { title: 'Admissions audit', summary: 'MXN 750 collected',
        kpis: [], comparison_table: { headers: [], rows: [] }, detailed_markdown: '# Facts', ai_engine: 'offline' }
      : { prompts: [{ category: 'Fee collections', prompt: 'Review outstanding fees' }] }), { status: fail && init.method === 'POST' ? 403 : 200 });
  };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'fetch', code)(mod, mod.exports, imports, fetch);
  const props = { startDate: '2026-11-01', endDate: '2026-11-30', allTime: false, repId: '12', courseId: '5' };
  const render = () => { cursor = 0; const tree = mod.exports.default(props); mounted = true; return tree; };
  return { render, requests, async effects() { effects.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); } };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

test('disabled AI module renders no form and makes no requests', async () => {
  const page = mount(false); assert.equal(page.render(), null); await page.effects(); assert.equal(page.requests.length, 0);
});

test('institute AI generation is manual and sends current course/date/rep filters', async () => {
  const page = mount(); page.render(); await page.effects();
  assert.deepEqual(page.requests.map(request => request.url), ['/api/backend/reports/ai/quick-prompts']);
  await find(page.render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const body = JSON.parse(page.requests[1].body);
  assert.equal(body.currency, 'MXN'); assert.equal(body.rep_id, 12); assert.equal(body.course_id, 5);
  assert.equal(body.time_range, 'custom'); assert.equal(body.start_date, '2026-11-01'); assert.equal(body.end_date, '2026-11-30');
  assert.ok(find(page.render(), node => node.type === 'h3' && node.props.children === 'Admissions audit'));
});

test('quota and authorization errors are visible without a fabricated report', async () => {
  const page = mount(true, true); page.render(); await page.effects();
  await find(page.render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(find(page.render(), node => node.props?.role === 'alert').props.children, 'Demo AI limit reached');
  assert.equal(find(page.render(), node => node.type === 'h3'), undefined);
});
