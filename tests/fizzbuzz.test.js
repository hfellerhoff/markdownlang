import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../src/parser/index.js';
import { interpret } from '../src/interpreter/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, '../examples');

function runFizzbuzz() {
  const md = readFileSync(resolve(examplesDir, 'fizzbuzz.md'), 'utf-8');
  const program = parse(md);
  return interpret(program, 'main', [], examplesDir);
}

describe('fizzbuzz.md', () => {
  test('produces exactly 100 lines', () => {
    const output = runFizzbuzz();
    assert.strictEqual(output.length, 100);
  });

  test('first 15 values are correct', () => {
    const output = runFizzbuzz();
    const expected = [1, 2, 'fizz', 4, 'buzz', 'fizz', 7, 8, 'fizz', 'buzz', 11, 'fizz', 13, 14, 'fizzbuzz'];
    assert.deepStrictEqual(output.slice(0, 15), expected);
  });

  test('multiples of 3 (not 15) are fizz', () => {
    const output = runFizzbuzz();
    const multiplesOf3Only = [3, 6, 9, 12, 18, 21, 24, 27, 33, 36, 39, 42, 48, 51, 54, 57, 63, 66, 69, 72, 78, 81, 84, 87, 93, 96, 99];
    for (const n of multiplesOf3Only) {
      assert.strictEqual(output[n - 1], 'fizz', `Position ${n} should be fizz`);
    }
  });

  test('multiples of 5 (not 15) are buzz', () => {
    const output = runFizzbuzz();
    const multiplesOf5Only = [5, 10, 20, 25, 35, 40, 50, 55, 65, 70, 80, 85, 95, 100];
    for (const n of multiplesOf5Only) {
      assert.strictEqual(output[n - 1], 'buzz', `Position ${n} should be buzz`);
    }
  });

  test('multiples of 15 are fizzbuzz', () => {
    const output = runFizzbuzz();
    const multiplesOf15 = [15, 30, 45, 60, 75, 90];
    for (const n of multiplesOf15) {
      assert.strictEqual(output[n - 1], 'fizzbuzz', `Position ${n} should be fizzbuzz`);
    }
  });

  test('non-multiples are the number itself', () => {
    const output = runFizzbuzz();
    const nonMultiples = [1, 2, 4, 7, 8, 11, 13, 14, 16, 17, 19, 22, 23, 26, 28, 29, 31, 32, 34, 37, 38, 41, 43, 44, 46, 47, 49, 52, 53, 56, 58, 59, 61, 62, 64, 67, 68, 71, 73, 74, 76, 77, 79, 82, 83, 86, 88, 89, 91, 92, 94, 97, 98];
    for (const n of nonMultiples) {
      assert.strictEqual(output[n - 1], n, `Position ${n} should be ${n}`);
    }
  });
});
