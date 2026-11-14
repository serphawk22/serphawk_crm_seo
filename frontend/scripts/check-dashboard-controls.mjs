import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function render(features, role = 'Admin', variant = 'dashboard_b2c') {
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const imports = name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'next/link') return { default: 'a' };
    if (name === '@/context/RoleContext') return { useRole: () => ({ role }) };
    if (name === '@/context/LanguageContext') return { useLanguage: () => ({ language: 'en', t: value => value }) };
    if (name === '@/i18n/config') return { formatCurrency: value => String(value) };
    if (name === '@/context/TenantConfigContext') return { useTenantConfig: () => ({ loaded: true, hasFeature: key => features[key] !== false }) };
    if (name === '@/components/DashboardSection') return compile('src/components/DashboardSection.tsx');
    throw new Error(`Unexpected import ${name}`);
  };
  function compile(path) {
    const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} };
    new Function('module', 'exports', 'require', code)(module, module.exports, imports);
    return module.exports;
  }
  return compile('src/components/DashboardManagement.tsx').default({ variant, unassignedLeads: 4, todayTasks: 7 });
}
function links(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(links);
  return [...(node.props?.href ? [node.props.href] : []), ...links(node.props?.children)];
}
assert.ok(links(render({})).includes('/enrollments'));
assert.ok(links(render({})).includes('/settings'));
assert.equal(render({ dashboard_b2c_operations: false }), null);
assert.equal(render({ dashboard_b2c: false }), null);
assert.ok(!links(render({ institute: false })).includes('/enrollments'));
assert.ok(!links(render({ reports: false })).includes('/reports'));
assert.ok(!links(render({}, 'Employee')).includes('/settings'));
assert.ok(!links(render({}, 'Employee')).includes('/leads'));
assert.equal(render({ command_center_work: false }, 'Admin', 'command_center'), null);
assert.ok(links(render({}, 'Admin', 'command_center')).includes('/leads'));
console.log('Dashboard management: rendered actions follow module, section, parent and role permissions.');
