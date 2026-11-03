import fs from 'node:fs';
import ts from 'typescript';

const module = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/lib/translate.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
new Function('require', 'module', 'exports', code)(name => {
  if (!name.startsWith('@/') || !name.endsWith('.json')) throw new Error(`Unexpected translation dependency: ${name}`);
  return JSON.parse(fs.readFileSync(`src/${name.slice(2)}`, 'utf8'));
}, module, module.exports);
export const { translate } = module.exports;
