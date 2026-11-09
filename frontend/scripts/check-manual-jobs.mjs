import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const events = () => {
  const listeners = new Map();
  return {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name) { for (const fn of listeners.get(name) || []) fn(); },
    size() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
};
let now = 0;
const timers = new Set();
const document = { ...events(), visibilityState: 'visible' };
const window = events();
const module = { exports: {} };
new Function('module', 'exports', 'document', 'window', 'setInterval', 'clearInterval', 'Date', compile('src/lib/visiblePoll.ts'))(
  module, module.exports, document, window, fn => { timers.add(fn); return fn; }, fn => timers.delete(fn), { now: () => now },
);
const { createVisiblePoll } = module.exports;
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const tick = async time => { now = time; for (const fn of timers) fn(); await settle(); };
let calls = 0;
const poll = createVisiblePoll(async () => { calls++; }, 1000);
await settle();
assert.equal(calls, 1);
await tick(60_000);
assert.equal(calls, 2);
await tick(120_000);
await tick(600_000);
assert.equal(calls, 2, 'An unattended visible tab must stop querying');
// Recreating a poll because a response changed React state must not reset user inactivity.
const recreated = createVisiblePoll(async () => { calls++; }, 1000);
await settle();
assert.equal(calls, 2);
window.emit('pointerdown');
await settle();
assert.equal(calls, 4, 'Real interaction resumes both idle polls');
document.visibilityState = 'hidden';
document.emit('visibilitychange');
await tick(601_000);
assert.equal(calls, 4);
document.visibilityState = 'visible';
document.emit('visibilitychange');
await settle();
assert.equal(calls, 6);
poll.dispose();
recreated.dispose();
assert.equal(timers.size, 0);
assert.equal(window.size() + document.size(), 0, 'Unmount removes all listeners');

let release;
let receivedSignal;
let pendingCalls = 0;
const slow = createVisiblePoll(signal => {
  pendingCalls++;
  receivedSignal = signal;
  return new Promise(resolve => { release = resolve; });
}, 1000);
await tick(602_000);
assert.equal(pendingCalls, 1, 'Slow requests must never overlap');
document.visibilityState = 'hidden';
document.emit('visibilitychange');
assert.equal(receivedSignal.aborted, true);
slow.dispose();
release();
await settle();
assert.equal(timers.size, 0);

// Mail-sending manual actions use the same confirmation gate as individual sends.
const confirmation = { exports: {} };
new Function('require', 'module', 'exports', compile('src/lib/emailConfirm.tsx'))(name => {
  if (name === '@/config') return { API_BASE_URL: 'https://api.example.test' };
  return {};
}, confirmation, confirmation.exports);
const info = (path, action) => confirmation.exports.emailTriggerInfo(`https://api.example.test${path}`, {
  method: 'POST', body: JSON.stringify({ action }),
});
assert.ok(info('/followups/run-now', 'reminders'));
assert.ok(info('/followups/run-now', 'send'));
assert.equal(info('/followups/run-now', 'scan'), null);
assert.ok(info('/email-campaigns/5/resume'));
console.log('Manual mail confirmations, idle/hidden polling, resume, cancellation and cleanup passed.');
