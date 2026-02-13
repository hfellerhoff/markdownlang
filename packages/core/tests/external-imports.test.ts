import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../src/parser/index.ts';
import { interpret, interpretAsync, clearExternalProgramCache } from '../src/interpreter/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, '../../examples/src');

describe('external file imports', () => {
  test('can call function from external file', () => {
    const md = readFileSync(resolve(examplesDir, 'file-import/import-test.md'), 'utf-8');
    const program = parse(md);
    const output = interpret(program, 'main', [], resolve(examplesDir, 'file-import'));

    // double(5) should output 10
    assert.strictEqual(output[0], 10);
  });

  test('parser adds externalFile to AST node', () => {
    const md = `# main\n\n[5](lib.md#double)\n`;
    const program = parse(md);
    const statement = program.functions['main'].body[0];

    assert.strictEqual(statement.type, 'FunctionCallStatement');
    if (statement.type === 'FunctionCallStatement') {
      assert.strictEqual(statement.externalFile, 'lib.md');
      assert.strictEqual(statement.functionName, 'double');
    }
  });

  test('parser handles internal calls correctly', () => {
    const md = `# main\n\n[5](#helper)\n`;
    const program = parse(md);
    const statement = program.functions['main'].body[0];

    assert.strictEqual(statement.type, 'FunctionCallStatement');
    if (statement.type === 'FunctionCallStatement') {
      assert.strictEqual(statement.externalFile, null);
      assert.strictEqual(statement.functionName, 'helper');
    }
  });

  test('throws error for missing external function', () => {
    const md = `# main\n\n[5](lib.md#nonexistent)\n`;
    const program = parse(md);

    assert.throws(
      () => interpret(program, 'main', [], resolve(examplesDir, 'file-import')),
      /Function 'nonexistent' not found in 'lib.md'/
    );
  });
});

describe('remote URL imports', () => {
  beforeEach(() => {
    clearExternalProgramCache();
  });

  test('parser handles URL external file', () => {
    const md = `# main\n\n[5](https://example.com/lib.md#double)\n`;
    const program = parse(md);
    const statement = program.functions['main'].body[0];

    assert.strictEqual(statement.type, 'FunctionCallStatement');
    if (statement.type === 'FunctionCallStatement') {
      assert.strictEqual(statement.externalFile, 'https://example.com/lib.md');
      assert.strictEqual(statement.functionName, 'double');
    }
  });

  test('sync interpret throws for URL imports', () => {
    const md = `# main\n\n[5](https://example.com/lib.md#double)\n`;
    const program = parse(md);

    assert.throws(
      () => interpret(program, 'main', [], process.cwd()),
      /Remote URL imports require interpretAsync/
    );
  });

  test('basic remote function call (mocked fetch)', async () => {
    const remoteLib = `# double\n\n- n\n- result = n * 2\n\n**{result}**\n`;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://example.com/lib.md') {
        return new Response(remoteLib, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      const md = `# main\n\n[5](https://example.com/lib.md#double)\n`;
      const program = parse(md);
      const output = await interpretAsync(program, 'main', [], process.cwd());
      assert.strictEqual(output[0], 10);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('nested relative imports within remote files (mocked fetch)', async () => {
    const remoteMain = `# main\n\n[5](helpers.md#double)\n`;
    const remoteHelpers = `# double\n\n- n\n- result = n * 2\n\n**{result}**\n`;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://example.com/pkg/main.md') {
        return new Response(remoteMain, { status: 200 });
      }
      if (url === 'https://example.com/pkg/helpers.md') {
        return new Response(remoteHelpers, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      const md = `# main\n\n[](#main)\n`;
      const program = parse(md);
      // Set the external call to the remote main.md
      const body = program.functions['main'].body;
      // Replace with a call to the remote file
      const remoteProgram = parse(`# entry\n\n[5](https://example.com/pkg/main.md#main)\n`);
      const output = await interpretAsync(remoteProgram, 'entry', [], process.cwd());
      assert.strictEqual(output[0], 10);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rejects non-.md remote URLs', async () => {
    const md = `# main\n\n[5](https://example.com/lib.js#double)\n`;
    const program = parse(md);
    await assert.rejects(
      () => interpretAsync(program, 'main', [], process.cwd()),
      /Remote imports must reference \.md files/
    );
  });

  test('404 error handling (mocked fetch)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    };

    try {
      const md = `# main\n\n[5](https://example.com/missing.md#double)\n`;
      const program = parse(md);
      await assert.rejects(
        () => interpretAsync(program, 'main', [], process.cwd()),
        /Failed to fetch remote file.*404/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('caching: multiple calls to same URL only fetch once (mocked fetch)', async () => {
    const remoteLib = `# double\n\n- n\n- result = n * 2\n\n**{result}**\n`;
    let fetchCount = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://example.com/lib.md') {
        fetchCount++;
        return new Response(remoteLib, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      const md = `# main\n\n[5](https://example.com/lib.md#double)\n\n[3](https://example.com/lib.md#double)\n`;
      const program = parse(md);
      const output = await interpretAsync(program, 'main', [], process.cwd());
      assert.strictEqual(output[0], 10);
      assert.strictEqual(output[1], 6);
      assert.strictEqual(fetchCount, 1, 'Should only fetch the URL once due to caching');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('real remote import from GitHub', async () => {
    const remoteUrl = 'https://raw.githubusercontent.com/markdownlang/markdownlang/refs/heads/main/packages/examples/src/file-import/lib.md';
    const md = `# main\n\n[5](${remoteUrl}#double)\n\n["world"](${remoteUrl}#greet)\n`;
    const program = parse(md);
    const output = await interpretAsync(program, 'main', [], process.cwd());
    assert.strictEqual(output[0], 10);
    assert.strictEqual(output[1], 'Hello, world!');
  });

  test('local and remote imports work together', async () => {
    const remoteLib = `# triple\n\n- n\n- result = n * 3\n\n**{result}**\n`;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://example.com/lib.md') {
        return new Response(remoteLib, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      const md = `# main\n\n[5](lib.md#double)\n\n[5](https://example.com/lib.md#triple)\n`;
      const program = parse(md);
      const output = await interpretAsync(program, 'main', [], resolve(examplesDir, 'file-import'));
      assert.strictEqual(output[0], 10);
      assert.strictEqual(output[1], 15);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
