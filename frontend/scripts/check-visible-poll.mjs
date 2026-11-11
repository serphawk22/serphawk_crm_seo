import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync("src/lib/visiblePoll.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { createVisiblePoll } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
let listener;
let tick;
let disposed = 0;
const inputListeners = new Map();
globalThis.window = {
  addEventListener(name, fn) { inputListeners.set(name, fn); },
  removeEventListener(name, fn) { assert.equal(inputListeners.get(name), fn); inputListeners.delete(name); },
};
globalThis.document = {
  visibilityState: "hidden",
  addEventListener(name, fn) { listener = fn; },
  removeEventListener(name, fn) { assert.equal(fn, listener); disposed++; },
};
globalThis.setInterval = fn => { tick = fn; return 1; };
globalThis.clearInterval = id => { assert.equal(id, 1); };
let calls = 0;
let release;
let signal;
const poll = createVisiblePoll(async s => {
  calls++;
  signal = s;
  await new Promise(resolve => { release = resolve; });
}, 15000);
assert.equal(calls, 0, "hidden mount performs no request");
document.visibilityState = "visible";
listener();
assert.equal(calls, 1, "foreground immediately refreshes");
tick(); tick();
await poll.refresh();
assert.equal(calls, 1, "slow requests never overlap timer/manual refreshes");
document.visibilityState = "hidden";
listener();
assert.equal(signal.aborted, true, "hiding aborts the previous request");
document.visibilityState = "visible";
listener();
release();
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls, 2, "return during an aborted request queues one refresh");
poll.dispose();
assert.equal(signal.aborted, true, "cleanup rejects results from the old account");
release();
await new Promise(resolve => setImmediate(resolve));
tick();
await poll.refresh();
assert.equal(calls, 2, "disposed poll cannot restart");
assert.equal(disposed, 1);
assert.equal(inputListeners.size, 0, "cleanup removes every input listener");

const originalNow = Date.now;
let now = originalNow();
Date.now = () => now;
let idleCalls = 0;
const idlePoll = createVisiblePoll(async () => { idleCalls++; }, 15000);
await new Promise(resolve => setImmediate(resolve));
assert.equal(idleCalls, 1);
now += 120001;
tick();
await idlePoll.refresh();
assert.equal(idleCalls, 1, "visible but idle tabs stop polling");
inputListeners.get("keydown")();
await new Promise(resolve => setImmediate(resolve));
assert.equal(idleCalls, 2, "user interaction resumes idle polling once");
idlePoll.dispose();
assert.equal(inputListeners.size, 0);
Date.now = originalNow;
console.log("Visible polling: visibility, idle pause, interaction resume, overlap, cancellation and disposal passed.");
