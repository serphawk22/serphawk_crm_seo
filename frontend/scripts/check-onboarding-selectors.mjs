import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

function compile(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, imports);
  return mod.exports.default;
}

function harness(call, errors = []) {
  const states = [], effects = [];
  let cursor = 0, mounted = false;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useEffect(fn) { if (!mounted) effects.push(fn); },
    useMemo: fn => fn(), useCallback: fn => fn,
  };
  const shared = { PRESET_ORDER: ["serphawk", "standard", "bpo", "full"], call, displayName: t => t.name };
  const imports = name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "./shared") return shared;
    if (name === "@/context/RoleContext") return { useRole: () => ({ user: { role: "SuperAdmin" } }) };
    if (name === "@/components/Toasts") return { useToasts: () => ({ toasts: [], error: (...args) => errors.push(args), success() {}, dismiss() {} }) };
    if (name === "framer-motion") return { useReducedMotion: () => true, motion: new Proxy({}, { get: (_, key) => key }) };
    return new Proxy({}, { get: (_, key) => key });
  };
  return {
    imports,
    render(component, props) { cursor = 0; const tree = component(props); mounted = true; return tree; },
    async effects() { effects.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find([node.props?.children, node.props?.footer], predicate);
}

test("platform page loads onboarding choices from its authorized endpoint", async () => {
  const requested = [];
  const h = harness(async path => {
    requested.push(path);
    if (path.endsWith("/overview")) return { tenants: [], totals: {}, total_modules: 0 };
    if (path.endsWith("/catalog")) return { features: [], presets: [] };
    return { industries: [], countries: [] };
  });
  h.render(compile("src/app/superadmin/clients/page.tsx", h.imports));
  await h.effects();
  assert.ok(requested.includes("/superadmin/onboarding/options"));
  assert.ok(!requested.includes("/register/options"));
});

test("unavailable onboarding choices show the API failure", async () => {
  const errors = [];
  const h = harness(async path => {
    if (path.endsWith("/overview")) return { tenants: [], totals: {}, total_modules: 0 };
    if (path.endsWith("/catalog")) return { features: [], presets: [] };
    throw new Error("Options temporarily unavailable");
  }, errors);
  h.render(compile("src/app/superadmin/clients/page.tsx", h.imports));
  await h.effects();
  assert.deepEqual(errors, [["Could not load business types and countries", "Options temporarily unavailable"]]);
});

test("business and country selectors render options and submit canonical values", async () => {
  const writes = [];
  const h = harness(async (path, init) => { writes.push({ path, body: JSON.parse(init.body) }); return { tenant_id: 9 }; });
  const component = compile("src/app/superadmin/clients/NewClientDrawer.tsx", h.imports);
  const props = { open: true, onClose() {}, onCreated() {}, onConfigure() {}, onError() {},
    presets: [{ key: "serphawk" }, { key: "bpo" }], regions: {
      industries: [{ key: "logistics", label: "Logistics", preset: "bpo" }],
      countries: [{ code: "IN", name: "India", dial_code: "+91" }],
    } };
  const render = () => h.render(component, props);
  let tree = render();
  const country = find(tree, node => node.props?.id === "new-client-country");
  const industry = find(tree, node => node.props?.id === "new-client-industry");
  assert.ok(find(country, node => node.type === "option" && node.props.value === "IN"));
  assert.ok(find(industry, node => node.type === "option" && node.props.value === "logistics"));
  assert.ok(find(tree, node => node.type === "label" && node.props.htmlFor === "new-client-country"));
  country.props.onChange({ target: { value: "IN" } });
  industry.props.onChange({ target: { value: "logistics" } });
  tree = render();
  for (const [placeholder, value] of [["Acme Logistics", "My Company"], ["Jane Doe", "My Admin"], ["jane@acme.com", "admin@mycompany.test"]]) {
    find(tree, node => node.type === "input" && node.props.placeholder === placeholder).props.onChange({ target: { value } });
    tree = render();
  }
  await find(tree, node => node.type === "button" && node.props.onClick?.name === "submit").props.onClick();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.country, "IN");
  assert.equal(writes[0].body.industry, "logistics");
  assert.equal(writes[0].body.preset, "bpo");
});
