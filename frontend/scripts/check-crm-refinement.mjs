import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const source = fs.readFileSync('src/lib/translate.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', js)(name => {
  assert.ok(name.startsWith('@/'));
  return JSON.parse(fs.readFileSync(path.join('src', name.slice(2)), 'utf8'));
}, module, module.exports);
const { translate } = module.exports;
const en = JSON.parse(fs.readFileSync('src/translations/en.json', 'utf8'));
const es = JSON.parse(fs.readFileSync('src/translations/es.json', 'utf8'));
let verified = 0;
function verifyKeys(english, spanish, prefix = '') {
  for (const [key, value] of Object.entries(english)) {
    const fullKey = prefix + key;
    if (typeof value === 'string') {
      assert.equal(typeof spanish[key], 'string', `Missing Spanish key: ${fullKey}`);
      assert.equal(translate(fullKey, 'en'), value);
      assert.equal(translate(fullKey, 'es'), spanish[key]);
      verified++;
    } else verifyKeys(value, spanish[key], fullKey + '.');
  }
}
verifyKeys(en, es);
assert.equal(translate('Register your company', 'es'), 'Registra tu empresa');
assert.equal(translate('No data recorded yet', 'es'), 'Todavía no hay datos registrados');
assert.equal(translate('Demo usage', 'es'), 'Uso de la demostración');
assert.equal(translate('Unknown customer text', 'es'), 'Unknown customer text');
assert.equal(translate('nonexistent.translation', 'es'), 'nonexistent.translation');
assert.equal(translate('Course admissions share', 'en'), 'Course admissions share');
assert.equal(translate('constructor', 'es'), 'constructor');

// A hidden widget must not mount its children (or start their API effects).
let tenant = { loaded: true, features: { dashboard: true, dashboard_followups: true, followups: true } };
const sectionsJs = ts.transpileModule(fs.readFileSync('src/components/DashboardSection.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const sections = { exports: {} };
new Function('require', 'module', 'exports', sectionsJs)(name => {
  if (name === '@/context/TenantConfigContext') return { useTenantConfig: () => ({ loaded: tenant.loaded, hasFeature: key => tenant.features[key] !== false }) };
  return require(name);
}, sections, sections.exports);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let mounted = 0;
function Child() { mounted++; return 'visible'; }
const widget = () => renderToStaticMarkup(React.createElement(sections.exports.default, { name: 'followups', module: 'followups' }, React.createElement(Child)));
assert.equal(widget(), 'visible');
for (const key of ['dashboard', 'dashboard_followups', 'followups']) {
  const before = mounted;
  tenant.features[key] = false;
  assert.equal(widget(), '');
  assert.equal(mounted, before);
  tenant.features[key] = true;
}
tenant.loaded = false;
assert.equal(widget(), '');

const selector = fs.readFileSync('src/components/LanguageSelector.tsx', 'utf8');
assert.ok(selector.includes('SUPPORTED_LANGUAGES.map'));
assert.ok(!selector.includes("setLanguage('en')"));
for (const file of ['src/components/Sidebar.tsx', 'src/components/LanguageSelector.tsx', 'src/app/signup/page.tsx']) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes('googtrans'), `Language switching must use app translations: ${file}`);
}

// Translated option labels must not change the canonical value sent to the API.
let localizedLabels = 0;
function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(filename);
    else if (filename.endsWith('.tsx')) {
      const text = fs.readFileSync(filename, 'utf8');
      const ast = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function walk(node) {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'LocalizedText') localizedLabels++;
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'option' && node.getText(ast).includes('<LocalizedText')) {
          assert.ok(node.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'value'), `Missing canonical option value: ${filename}`);
        }
        ts.forEachChild(node, walk);
      }
      walk(ast);
    }
  }
}
checkDirectory('src');
assert.ok(localizedLabels >= 900, `Expected broad product-copy coverage, got ${localizedLabels}`);
const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
assert.ok(!sidebar.includes('item-deals'));
assert.ok(!sidebar.includes('item-scmhub-cases'));
assert.ok(!fs.existsSync('src/app/pipeline/page.tsx'));
assert.ok(!fs.existsSync('src/app/support/scmhub-cases/page.tsx'));
const login = fs.readFileSync('src/app/login/page.tsx', 'utf8');
assert.ok(!login.includes('handleDemoLogin'));
assert.ok(!login.includes('Try the Admin Demo Account'));
assert.ok(login.includes('/signup') && login.includes('/register'));
console.log(`CRM refinement checks passed: ${verified} translation keys, ${localizedLabels} product labels, canonical select values and retired modules.`);
