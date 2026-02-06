import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../src/parser/index.js';
import { interpret } from '../src/interpreter/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, '../examples');

describe('external file imports', () => {
  test('can call function from external file', () => {
    const md = readFileSync(resolve(examplesDir, 'import-test.md'), 'utf-8');
    const program = parse(md);
    const output = interpret(program, 'main', [], examplesDir);

    // double(5) should output 10
    assert.strictEqual(output[0], 10);
  });

  test('parser adds externalFile to AST node', () => {
    const md = `# main\n\n[5](lib.md#double)\n`;
    const program = parse(md);
    const statement = program.functions['main'].body[0];

    assert.strictEqual(statement.type, 'FunctionCallStatement');
    assert.strictEqual(statement.externalFile, 'lib.md');
    assert.strictEqual(statement.functionName, 'double');
  });

  test('parser handles internal calls correctly', () => {
    const md = `# main\n\n[5](#helper)\n`;
    const program = parse(md);
    const statement = program.functions['main'].body[0];

    assert.strictEqual(statement.type, 'FunctionCallStatement');
    assert.strictEqual(statement.externalFile, null);
    assert.strictEqual(statement.functionName, 'helper');
  });

  test('throws error for missing external function', () => {
    const md = `# main\n\n[5](lib.md#nonexistent)\n`;
    const program = parse(md);

    assert.throws(
      () => interpret(program, 'main', [], examplesDir),
      /Function 'nonexistent' not found in 'lib.md'/
    );
  });
});
