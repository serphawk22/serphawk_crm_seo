import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/lib/leadWorkflow.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { leadStages, scheduleStage } = mod.exports;

assert.equal(scheduleStage('Webinar Scheduled', false), null, 'Other tenants must not open institute scheduling');
for (const stage of ['Follow-up', 'Webinar Scheduled', 'Walk-in Scheduled']) {
  assert.equal(scheduleStage(stage, true), stage);
}
assert.equal(scheduleStage('Walk-in Attended', true), null);
assert.deepEqual(leadStages(null, false, ['New'], ['Legacy stage', 'New']), ['New', 'Legacy stage']);
assert.ok(leadStages(null, true, ['New'], []).includes('Webinar Not Attended'));
assert.deepEqual(leadStages(['New', 'Custom'], true, [], ['Old']), ['New', 'Custom', 'Old'], 'Explicit tenant choices win; existing leads never vanish');
const apiSource = fs.readFileSync('src/lib/apiRequest.ts', 'utf8');
const apiJs = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const apiMod = { exports: {} };
new Function('module', 'exports', apiJs)(apiMod, apiMod.exports);
const { isInternalApi } = apiMod.exports;
const origin = 'https://app.test';
const backend = 'https://api.test/v2';
assert.equal(isInternalApi('/api/backend/leads', backend, origin), true);
assert.equal(isInternalApi('https://app.test/api/backend/leads', backend, origin), true);
assert.equal(isInternalApi('https://api.test/v2/leads', backend, origin), true);
assert.equal(isInternalApi('https://api.test.evil/v2/leads', backend, origin), false);
assert.equal(isInternalApi('//evil.test/leads', backend, origin), false);
assert.equal(isInternalApi('https://api.test/v20/leads', backend, origin), false);
assert.equal(isInternalApi(new URL('https://api.test/v2/leads'), backend, origin), true);
console.log('Lead workflow and API-origin checks passed (15 assertions).');
