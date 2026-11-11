import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/lib/homeModule.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { homeModule } = mod.exports;
for (const role of ['Admin', 'SalesManager', 'Demo']) {
  assert.equal(homeModule(role, { dashboard: true, command_center: false }), 'dashboard');
  assert.equal(homeModule(role, { dashboard: false, command_center: true }), 'command_center');
  assert.equal(homeModule(role, { dashboard: true, command_center: true }), 'command_center');
  assert.equal(homeModule(role, { dashboard: false, command_center: false }), 'none');
}
assert.equal(homeModule('Admin', { dashboard: true, institute: true, dashboard_b2c: true }), 'dashboard_b2c');
assert.equal(homeModule('Admin', { dashboard: true, institute: false, dashboard_b2c: true }), 'dashboard');
assert.equal(homeModule('SuperAdmin', { dashboard: false }), 'platform');
assert.equal(homeModule('Client', { dashboard: false, command_center: true }), 'none');
console.log('Independent home module checks passed.');
