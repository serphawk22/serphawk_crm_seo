import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/lib/sidebarPreferences.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { mergeSidebarSections: merge, pinDashboardNavigation: pin, sidebarPathMatches: matches } = mod.exports;
const catalog = [{ id: 'home', heading: null, items: [{ id: 'dashboard', href: '/' }] }, { id: 'crm', heading: 'CRM', items: [{ id: 'leads', href: '/leads' }, { id: 'contacts', href: '/contacts' }] }];
assert.equal(matches('/leads/7', '/leads'), true);
assert.equal(matches('/leads-archive', '/leads'), false);
assert.equal(matches('/clients', '/'), false);
assert.deepEqual(merge(catalog, null), catalog);
const result = merge(catalog, [null, { id: 'unknown' }, { id: 'crm', heading: 'My CRM', items: [{ id: 'leads', href: 'https://bad.test' }, { id: 'leads' }, null] }, { id: 'crm', items: [] }]);
assert.deepEqual(result.map(s => s.id), ['crm', 'home']);
assert.equal(result[0].heading, 'My CRM');
assert.deepEqual(result[0].items, catalog[1].items, 'Saved preferences cannot inject routes, duplicate links or lose new menu entries');
assert.deepEqual(merge(catalog, [{ id: 'home', heading: 'Renamed', items: {} }])[0], catalog[0]);
console.log('Sidebar navigation and preference regression checks passed.');

const oldNavigation = [
  { id: 'section-business-suite', heading: 'My Suite', items: [{ id: 'item-command-center', href: '/command-center' }, { id: 'revenue' }] },
  { id: 'section-home', heading: null, items: [{ id: 'item-dashboard', href: '/legacy-command-center' }, { id: 'item-dashboard-b2c', href: '/dashboard-b2c' }, { id: 'inbox' }] },
];
const before = JSON.stringify(oldNavigation);
const pinned = pin(oldNavigation);
assert.equal(pinned[0].id, 'section-home');
assert.deepEqual(pinned[0].items.map(item => item.id), ['item-dashboard-b2c', 'item-command-center', 'item-dashboard', 'inbox']);
assert.deepEqual(pinned[1].items.map(item => item.id), ['revenue']);
assert.equal(pinned[1].heading, 'My Suite');
assert.equal(JSON.stringify(oldNavigation), before, 'Display ordering must not mutate saved preferences');
assert.deepEqual(pin(pinned), pinned, 'Dashboard links must appear exactly once');
console.log('Current dashboards stay at the top with pre-migration sidebar preferences.');
