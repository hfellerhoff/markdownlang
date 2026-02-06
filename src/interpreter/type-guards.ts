import type { RuntimeValue } from '../types.ts';

/**
 * Custom error for runtime type mismatches
 */
export class RuntimeTypeError extends Error {
  constructor(message: string, line?: number) {
    super(line ? `Line ${line}: ${message}` : message);
    this.name = 'RuntimeTypeError';
  }
}

/**
 * Custom error for undeclared variable access
 */
export class UndeclaredVariableError extends Error {
  constructor(variableName: string, line?: number) {
    const message = `Variable '${variableName}' is not declared. Use '- ${variableName} = value' to declare it.`;
    super(line ? `Line ${line}: ${message}` : message);
    this.name = 'UndeclaredVariableError';
  }
}

/**
 * Validate that a value is a number
 */
export function expectNumber(value: RuntimeValue, context: string, line?: number): number {
  if (typeof value !== 'number') {
    throw new RuntimeTypeError(
      `Expected number for ${context}, got ${typeof value} (${value})`,
      line
    );
  }
  return value;
}

/**
 * Validate that a value is a string
 */
export function expectString(value: RuntimeValue, context: string, line?: number): string {
  if (typeof value !== 'string') {
    throw new RuntimeTypeError(
      `Expected string for ${context}, got ${typeof value} (${value})`,
      line
    );
  }
  return value;
}

/**
 * Validate that a value is a string or number (for member access index)
 */
export function expectStringOrNumber(value: RuntimeValue, context: string, line?: number): string | number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new RuntimeTypeError(
      `Expected string or number for ${context}, got ${typeof value} (${value})`,
      line
    );
  }
  return value;
}

/**
 * Validate that a value is indexable (string or object, for member access base)
 */
export function expectIndexable(
  value: RuntimeValue,
  context: string,
  line?: number
): string | Record<string | number, RuntimeValue> {
  if (typeof value === 'string') {
    return value;
  }
  if (value !== null && value !== undefined && typeof value === 'object') {
    return value as Record<string | number, RuntimeValue>;
  }
  throw new RuntimeTypeError(
    `Expected string or object for ${context}, got ${typeof value} (${value})`,
    line
  );
}
