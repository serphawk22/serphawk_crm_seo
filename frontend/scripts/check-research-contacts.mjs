import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const load = (file, resolve) => {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
};
const contacts = load('src/lib/researchContacts.ts', require);
assert.equal(contacts.researchRecipient({ contact: { email: 'Extracted Phone Numbers:' }, company_info: { extracted_emails: ['', 'sales@site.test'] } }), 'sales@site.test');
assert.equal(contacts.researchRecipient({ company_info: { contacts: [{ name: 'Owner' }, { email: 'hello@site.test' }] } }), 'hello@site.test');
assert.equal(contacts.researchRecipient({ company_info: { extracted_emails: 'Extracted Phone Numbers:' } }), '');
assert.equal(contacts.researchRecipient({ company_info: { extracted_emails: ['test@example.com', 'support.crm@serphawk.in', 'logo@2x.png'] } }), '');
assert.deepEqual(contacts.emailAddresses('Sales <sales@site.test>; hello@site.test', ['sales@SITE.test']), ['sales@site.test', 'hello@site.test']);
for (const value of ['Extracted Phone Numbers:', 'someone@site.test\nBcc: other@site.test', 'not an email', '', null]) assert.equal(contacts.isEmailAddress(value), false);

let posts = 0;
const common = name => {
  if (name === '@/components/LocalizedText') return { __esModule: true, default: ({ text }) => text };
  if (name === '@/context/RoleContext') return { useRole: () => ({ role: 'Admin' }) };
  if (name === '@/context/LanguageContext') return { useLanguage: () => ({ t: key => key }) };
  if (name === '@/context/TenantConfigContext') return { useTenantConfig: () => ({ hasFeature: () => true }) };
  if (name === '@/lib/researchContacts') return contacts;
  if (name === '@/lib/inboxApi') return { post: () => { posts++; throw Error('Unexpected mail request'); }, errorText: () => '' };
  if (name === '@/lib/followupsApi') return { campaignsApi: { list: () => { posts++; throw Error('Unexpected passive query'); } }, followupsApi: {}, wasCancelled: r => !!r.cancelled };
  if (name.endsWith('/followupUi') || name === './followupUi') return { btn: { secondary: '' } };
  if (name === '@/components/followups/FollowUpList') return { __esModule: true, default: () => null };
  if (name === '@/components/followups/FollowUpDialogs') return { FollowUpFormDialog: () => null };
  if (name === '@/lib/utils') return { cn: (...values) => values.filter(Boolean).join(' ') };
  if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  return require(name);
};
const actions = load('src/components/followups/ManualFollowUpActions.tsx', common);
const followups = load('src/app/followups/page.tsx', name => name === '@/components/followups/ManualFollowUpActions' ? actions : common(name));
const followupsHtml = renderToStaticMarkup(React.createElement(followups.default));
for (const label of ['Send due reminders', 'Send due emails', 'Scan recent notes']) assert.ok(followupsHtml.includes(label), `${label} must appear on the sidebar's /followups page`);
const mailActions = load('src/components/email-agent/ManualEmailActions.tsx', common);
const mailHtml = renderToStaticMarkup(React.createElement(mailActions.default));
assert.ok(mailHtml.includes('Campaign recovery'));
assert.ok(mailHtml.includes('Follow-up actions'));
assert.equal(posts, 0, 'Showing manual controls must not run jobs or load campaigns');

const card = load('src/components/email-agent/ResultCard.tsx', common);
const props = result => ({ historyId: 'synthetic', result, companyName: 'Synthetic', companyUrl: 'https://site.test', onSendManually() {}, onSendAutomatically() {}, onSaveFollowUp() {}, onRemove() {} });
const toInput = html => html.match(/<input[^>]*aria-label="Recipient email"[^>]*>/)?.[0] || '';
const broken = { contact: { email: 'Extracted Phone Numbers:' }, company_info: { extracted_emails: 'Extracted Phone Numbers:' }, draft: {} };
const brokenHtml = renderToStaticMarkup(React.createElement(card.ResultCard, props(broken)));
assert.ok(toInput(brokenHtml).includes('value=""'));
assert.ok(brokenHtml.includes('No usable email was found.'));
const recovered = { ...broken, company_info: { extracted_emails: ['Extracted Phone Numbers:', 'hello@site.test'] } };
assert.ok(toInput(renderToStaticMarkup(React.createElement(card.ResultCard, props(recovered)))).includes('value="hello@site.test"'));

// Exercise updates to this card, including keeping an address typed by the user.
const hooks = [];
let cursor = 0;
let effects = [];
const hookReact = { ...React,
  useState(initial) {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    hooks[index] ??= { current: initial };
    return hooks[index];
  },
  useEffect(effect, deps) {
    const index = cursor++;
    if (!hooks[index] || deps.some((value, i) => value !== hooks[index].deps[i])) effects.push(effect);
    hooks[index] = { deps };
  },
};
const stateful = load('src/components/email-agent/ResultCard.tsx', name => name === 'react' ? hookReact : common(name));
const findInput = node => {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'input' && node.props['aria-label'] === 'Recipient email') return node;
  const children = React.Children.toArray(node.props?.children);
  for (const child of children) { const found = findInput(child); if (found) return found; }
};
const renderCard = result => {
  cursor = 0; effects = [];
  const tree = stateful.ResultCard(props(result));
  effects.forEach(effect => effect());
  return findInput(tree);
};
renderCard(broken);
renderCard(recovered);
assert.equal(renderCard(recovered).props.value, 'hello@site.test', 'New research fills the untouched To field');
renderCard(recovered).props.onChange({ target: { value: 'chosen@site.test' } });
const updated = { ...recovered, contact: { email: 'different@site.test' } };
renderCard(updated);
assert.equal(renderCard(updated).props.value, 'chosen@site.test', 'Updated research must preserve the user-entered recipient');
console.log('Research recipient parsing, rendered To field, manual edits and visible manual controls passed.');
