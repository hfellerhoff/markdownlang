import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parse } from '../src/parser/index.ts';
import { interpret } from '../src/interpreter/index.ts';
import { RuntimeTypeError, UndeclaredVariableError } from '../src/interpreter/type-guards.ts';

describe('runtime type errors', () => {
  test('subtraction with string throws RuntimeTypeError with line number', () => {
    const markdown = `# main

- x = "hello"
- y = x - 5
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.strictEqual(err.message, 'Line 4: Expected number for left operand of -, got string (hello)');
        return true;
      }
    );
  });

  test('multiplication with string throws RuntimeTypeError', () => {
    const markdown = `# main

- a = 10
- b = a * "world"
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Line 4:.*Expected number for right operand of \*/);
        return true;
      }
    );
  });

  test('division with boolean throws RuntimeTypeError', () => {
    const markdown = `# main

- x = 10 / true
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Expected number for right operand of \//);
        return true;
      }
    );
  });

  test('comparison operators require numbers', () => {
    const markdown = `# main

- result = "a" < "b"
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Expected number for left operand of </);
        return true;
      }
    );
  });

  test('unary minus requires number', () => {
    const markdown = `# main

- x = "hello"
- y = -x
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Line 4:.*Expected number for operand of unary -/);
        return true;
      }
    );
  });

  test('compound subtraction assignment requires numbers', () => {
    const markdown = `# main

- x = "hello"

x -= 5
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Line 5:.*Expected number for variable 'x'/);
        return true;
      }
    );
  });

  test('compound multiplication assignment requires numbers', () => {
    const markdown = `# main

- x = 10

x *= "bad"
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Line 5:.*Expected number for assignment value/);
        return true;
      }
    );
  });

  test('string concatenation with + does not throw', () => {
    const markdown = `# main

- x = "hello"
- y = x + " world"

**{y}**
`;
    const program = parse(markdown);
    const result = interpret(program);
    assert.deepStrictEqual(result, ['hello world']);
  });

  test('string concatenation with += does not throw', () => {
    const markdown = `# main

- text = "hello"

text += " world"

**{text}**
`;
    const program = parse(markdown);
    const result = interpret(program);
    assert.deepStrictEqual(result, ['hello world']);
  });

  test('number + string coerces to string', () => {
    const markdown = `# main

- x = 42
- y = x + " is the answer"

**{y}**
`;
    const program = parse(markdown);
    const result = interpret(program);
    assert.deepStrictEqual(result, ['42 is the answer']);
  });

  test('error in conditional block includes line number', () => {
    const markdown = `# main

- x = "text"

## _x > 5_

**yes**
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Line 5:.*Expected number/);
        return true;
      }
    );
  });

  test('error in function call argument includes line number', () => {
    const markdown = `# main

[10 - "bad"](#helper)

# helper

- x

**{x}**
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof RuntimeTypeError);
        assert.match(err.message, /Line 3:.*Expected number/);
        return true;
      }
    );
  });

  test('undeclared variable assignment throws UndeclaredVariableError', () => {
    const markdown = `# main

x = 5
`;
    const program = parse(markdown);
    assert.throws(
      () => interpret(program),
      (err: Error) => {
        assert(err instanceof UndeclaredVariableError);
        assert.match(err.message, /Variable 'x' is not declared/);
        return true;
      }
    );
  });

  test('variable declaration with list syntax works', () => {
    const markdown = `# main

- x = 5
- y = 10
- sum = x + y

**{sum}**
`;
    const program = parse(markdown);
    const result = interpret(program);
    assert.deepStrictEqual(result, [15]);
  });

  test('assignment to declared variable works', () => {
    const markdown = `# main

- x = 5

x = 10

**{x}**
`;
    const program = parse(markdown);
    const result = interpret(program);
    assert.deepStrictEqual(result, [10]);
  });
});
