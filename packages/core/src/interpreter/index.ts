import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Runtime } from './runtime.ts';
import { evaluate } from './evaluator.ts';
import { expectNumber, UndeclaredVariableError } from './type-guards.ts';
import { parse } from '../parser/index.ts';
import {
  TAIL_CALL,
  type Program,
  type FunctionDeclaration,
  type Statement,
  type PrintStatement,
  type AssignmentStatement,
  type FunctionCallStatement,
  type ConditionalBlock,
  type InputStatement,
  type VariableDeclaration,
  type RuntimeValue,
  type InputReader,
  type PrintHandler,
  type TailCallResult,
} from '../types.ts';

// Cache for external programs to avoid re-parsing
const externalProgramCache = new Map<string, Program>();

export function clearExternalProgramCache(): void {
  externalProgramCache.clear();
}

function isUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

/**
 * Load and parse an external markdown file
 */
function loadExternalProgram(filePath: string, baseDir: string): { program: Program; fullPath: string } {
  const fullPath = resolve(baseDir, filePath);

  if (externalProgramCache.has(fullPath)) {
    return { program: externalProgramCache.get(fullPath)!, fullPath };
  }

  const markdown = readFileSync(fullPath, 'utf-8');
  const program = parse(markdown);
  program._baseDir = dirname(fullPath);
  externalProgramCache.set(fullPath, program);

  return { program, fullPath };
}

/**
 * Load and parse an external markdown file, supporting remote URLs
 */
async function loadExternalProgramAsync(filePath: string, baseDir: string): Promise<{ program: Program; fullPath: string }> {
  if (isUrl(filePath) || isUrl(baseDir)) {
    const fullUrl = isUrl(filePath) ? filePath : new URL(filePath, baseDir).href;
    const urlPath = new URL(fullUrl).pathname;
    if (!urlPath.endsWith('.md')) {
      throw new Error(`Remote imports must reference .md files, got '${fullUrl}'`);
    }

    if (externalProgramCache.has(fullUrl)) {
      return { program: externalProgramCache.get(fullUrl)!, fullPath: fullUrl };
    }

    const response = await fetch(fullUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch remote file '${fullUrl}': ${response.status} ${response.statusText}`);
    }
    const markdown = await response.text();
    const program = parse(markdown);
    program._baseDir = new URL('.', fullUrl).href;
    externalProgramCache.set(fullUrl, program);

    return { program, fullPath: fullUrl };
  }

  return loadExternalProgram(filePath, baseDir);
}

/**
 * Interpret a Program AST
 */
export function interpret(
  program: Program,
  entryPoint: string = 'main',
  args: RuntimeValue[] = [],
  baseDir: string = process.cwd(),
  inputs: RuntimeValue[] = []
): RuntimeValue[] {
  const runtime = new Runtime();
  runtime.setInput(inputs);
  program._baseDir = baseDir;

  // Find the entry function
  const mainFunc = program.functions[entryPoint];
  if (!mainFunc) {
    throw new Error(`Entry function '${entryPoint}' not found`);
  }

  // Execute with trampoline for tail call optimization
  let result: TailCallResult | null = { type: TAIL_CALL, program, func: mainFunc, args, runtime };
  while (result && result.type === TAIL_CALL) {
    result = executeFunction(result.program, result.func, result.args, result.runtime);
  }

  return runtime.getOutput();
}

function executeFunction(
  program: Program,
  func: FunctionDeclaration,
  args: RuntimeValue[],
  runtime: Runtime
): TailCallResult | null {
  // Create argument bindings
  const argBindings: Record<string, RuntimeValue> = {};
  for (let i = 0; i < func.parameters.length; i++) {
    argBindings[func.parameters[i]] = args[i];
  }

  // Push call frame
  runtime.pushFrame(func.name, argBindings);

  // Execute function body
  const result = executeBlock(program, func.body, runtime);

  // Pop call frame
  runtime.popFrame();

  // Return tail call info if present
  return result;
}

function executeBlock(
  program: Program,
  statements: Statement[],
  runtime: Runtime
): TailCallResult | null {
  for (let i = 0; i < statements.length; i++) {
    if (runtime.breakFlag) {
      break;
    }
    const isLast = i === statements.length - 1;
    const result = executeStatement(program, statements[i], runtime, isLast);
    // If this is a tail call, return it immediately
    if (result && result.type === TAIL_CALL) {
      return result;
    }
  }
  return null;
}

function executeStatement(
  program: Program,
  statement: Statement,
  runtime: Runtime,
  isLast: boolean = false
): TailCallResult | null {
  switch (statement.type) {
    case 'PrintStatement':
      executePrint(statement, runtime);
      return null;

    case 'AssignmentStatement':
      executeAssignment(statement, runtime);
      return null;

    case 'VariableDeclaration':
      executeVariableDeclaration(statement, runtime);
      return null;

    case 'FunctionCallStatement':
      return executeFunctionCall(program, statement, runtime, isLast);

    case 'ConditionalBlock':
      return executeConditional(program, statement, runtime);

    case 'BreakStatement':
      runtime.setBreak();
      return null;

    case 'InputStatement':
      executeInput(statement, runtime);
      return null;

    default:
      throw new Error(`Unknown statement type: ${(statement as Statement).type}`);
  }
}

function executeInput(statement: InputStatement, runtime: Runtime): void {
  const value = runtime.readInput();
  // Input declares the variable if not already declared
  if (!runtime.isDeclared(statement.variable)) {
    runtime.declareVariable(statement.variable, value);
  } else {
    runtime.setVariable(statement.variable, value);
  }
}

function executeVariableDeclaration(statement: VariableDeclaration, runtime: Runtime): void {
  const value = evaluate(statement.value, runtime, statement.line);
  runtime.declareVariable(statement.variable, value);
}

// Async input execution
async function executeInputAsync(statement: InputStatement, runtime: Runtime): Promise<void> {
  const value = await runtime.readInputAsync();
  // Input declares the variable if not already declared
  if (!runtime.isDeclared(statement.variable)) {
    runtime.declareVariable(statement.variable, value);
  } else {
    runtime.setVariable(statement.variable, value);
  }
}

function executePrint(statement: PrintStatement, runtime: Runtime): void {
  const value = evaluate(statement.expression, runtime, statement.line);
  runtime.print(value);
}

function executeAssignment(statement: AssignmentStatement, runtime: Runtime): void {
  // Check that variable is declared
  if (!runtime.isDeclared(statement.variable)) {
    throw new UndeclaredVariableError(statement.variable, statement.line);
  }

  const newValue = evaluate(statement.value, runtime, statement.line);

  if (statement.operator) {
    // Compound assignment
    const currentValue = runtime.getVariable(statement.variable) ?? getDefaultValue(newValue);
    let result: RuntimeValue;

    switch (statement.operator) {
      case '+':
        // Allow string concatenation: string += string OR string += number
        if (typeof currentValue === 'string' || typeof newValue === 'string') {
          result = String(currentValue ?? '') + String(newValue ?? '');
        } else {
          result = expectNumber(currentValue, `variable '${statement.variable}'`, statement.line) +
                   expectNumber(newValue, 'assignment value', statement.line);
        }
        break;
      case '-':
        result = expectNumber(currentValue, `variable '${statement.variable}'`, statement.line) -
                 expectNumber(newValue, 'assignment value', statement.line);
        break;
      case '*':
        result = expectNumber(currentValue, `variable '${statement.variable}'`, statement.line) *
                 expectNumber(newValue, 'assignment value', statement.line);
        break;
      case '/':
        result = expectNumber(currentValue, `variable '${statement.variable}'`, statement.line) /
                 expectNumber(newValue, 'assignment value', statement.line);
        break;
      default:
        throw new Error(`Unknown compound operator: ${statement.operator}`);
    }

    runtime.setVariable(statement.variable, result);
  } else {
    // Simple assignment
    runtime.setVariable(statement.variable, newValue);
  }
}

function getDefaultValue(value: RuntimeValue): RuntimeValue {
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  return undefined;
}

function executeFunctionCall(
  program: Program,
  statement: FunctionCallStatement,
  runtime: Runtime,
  isLast: boolean = false
): TailCallResult | null {
  let targetProgram = program;
  let func: FunctionDeclaration;

  if (statement.externalFile) {
    const baseDir = program._baseDir || process.cwd();
    if (isUrl(statement.externalFile) || isUrl(baseDir)) {
      throw new Error(`Remote URL imports require interpretAsync(). Use interpretAsync() to call functions from '${statement.externalFile}'.`);
    }
    // Load external file
    const { program: externalProgram } = loadExternalProgram(statement.externalFile, baseDir);
    targetProgram = externalProgram;
    func = externalProgram.functions[statement.functionName];
    if (!func) {
      throw new Error(`Function '${statement.functionName}' not found in '${statement.externalFile}'`);
    }
  } else {
    func = program.functions[statement.functionName];
    if (!func) {
      throw new Error(`Function '${statement.functionName}' not found`);
    }
  }

  // Evaluate arguments
  const args = statement.arguments.map(arg => evaluate(arg, runtime, statement.line));

  // If this is a tail call (last statement in block), return thunk for trampoline
  if (isLast) {
    return { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  }

  // Otherwise execute normally with trampoline
  let result: TailCallResult | null = { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  while (result && result.type === TAIL_CALL) {
    result = executeFunction(result.program, result.func, result.args, result.runtime as Runtime);
  }
  // Clear break flag so it doesn't propagate to the caller
  runtime.clearBreak();
  return null;
}

function executeConditional(
  program: Program,
  statement: ConditionalBlock,
  runtime: Runtime
): TailCallResult | null {
  const condition = evaluate(statement.condition, runtime, statement.line);

  if (condition) {
    return executeBlock(program, statement.body, runtime);
  }
  return null;
}

/**
 * Interpret a Program AST asynchronously (supports interactive input)
 */
export async function interpretAsync(
  program: Program,
  entryPoint: string = 'main',
  args: RuntimeValue[] = [],
  baseDir: string = process.cwd(),
  inputReader: InputReader | null = null,
  printHandler: PrintHandler | null = null
): Promise<RuntimeValue[]> {
  const runtime = new Runtime();
  if (inputReader) {
    runtime.setInputReader(inputReader);
  }
  if (printHandler) {
    runtime.setPrintHandler(printHandler);
  }
  program._baseDir = baseDir;

  // Find the entry function
  const mainFunc = program.functions[entryPoint];
  if (!mainFunc) {
    throw new Error(`Entry function '${entryPoint}' not found`);
  }

  // Execute with async trampoline for tail call optimization
  let result: TailCallResult | null = { type: TAIL_CALL, program, func: mainFunc, args, runtime };
  while (result && result.type === TAIL_CALL) {
    result = await executeFunctionAsync(result.program, result.func, result.args, result.runtime as Runtime);
  }

  return runtime.getOutput();
}

async function executeFunctionAsync(
  program: Program,
  func: FunctionDeclaration,
  args: RuntimeValue[],
  runtime: Runtime
): Promise<TailCallResult | null> {
  // Create argument bindings
  const argBindings: Record<string, RuntimeValue> = {};
  for (let i = 0; i < func.parameters.length; i++) {
    argBindings[func.parameters[i]] = args[i];
  }

  // Push call frame
  runtime.pushFrame(func.name, argBindings);

  // Execute function body
  const result = await executeBlockAsync(program, func.body, runtime);

  // Pop call frame
  runtime.popFrame();

  // Return tail call info if present
  return result;
}

async function executeBlockAsync(
  program: Program,
  statements: Statement[],
  runtime: Runtime
): Promise<TailCallResult | null> {
  for (let i = 0; i < statements.length; i++) {
    if (runtime.breakFlag) {
      break;
    }
    const isLast = i === statements.length - 1;
    const result = await executeStatementAsync(program, statements[i], runtime, isLast);
    // If this is a tail call, return it immediately
    if (result && result.type === TAIL_CALL) {
      return result;
    }
  }
  return null;
}

async function executeStatementAsync(
  program: Program,
  statement: Statement,
  runtime: Runtime,
  isLast: boolean = false
): Promise<TailCallResult | null> {
  switch (statement.type) {
    case 'PrintStatement':
      executePrint(statement, runtime);
      return null;

    case 'AssignmentStatement':
      executeAssignment(statement, runtime);
      return null;

    case 'VariableDeclaration':
      executeVariableDeclaration(statement, runtime);
      return null;

    case 'FunctionCallStatement':
      return await executeFunctionCallAsync(program, statement, runtime, isLast);

    case 'ConditionalBlock':
      return await executeConditionalAsync(program, statement, runtime);

    case 'BreakStatement':
      runtime.setBreak();
      return null;

    case 'InputStatement':
      await executeInputAsync(statement, runtime);
      return null;

    default:
      throw new Error(`Unknown statement type: ${(statement as Statement).type}`);
  }
}

async function executeFunctionCallAsync(
  program: Program,
  statement: FunctionCallStatement,
  runtime: Runtime,
  isLast: boolean = false
): Promise<TailCallResult | null> {
  let targetProgram = program;
  let func: FunctionDeclaration;

  if (statement.externalFile) {
    // Load external file (supports remote URLs)
    const baseDir = program._baseDir || process.cwd();
    const { program: externalProgram } = await loadExternalProgramAsync(statement.externalFile, baseDir);
    targetProgram = externalProgram;
    func = externalProgram.functions[statement.functionName];
    if (!func) {
      throw new Error(`Function '${statement.functionName}' not found in '${statement.externalFile}'`);
    }
  } else {
    func = program.functions[statement.functionName];
    if (!func) {
      throw new Error(`Function '${statement.functionName}' not found`);
    }
  }

  // Evaluate arguments
  const args = statement.arguments.map(arg => evaluate(arg, runtime, statement.line));

  // If this is a tail call (last statement in block), return thunk for trampoline
  if (isLast) {
    return { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  }

  // Otherwise execute normally with async trampoline
  let result: TailCallResult | null = { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  while (result && result.type === TAIL_CALL) {
    result = await executeFunctionAsync(result.program, result.func, result.args, result.runtime as Runtime);
  }
  // Clear break flag so it doesn't propagate to the caller
  runtime.clearBreak();
  return null;
}

async function executeConditionalAsync(
  program: Program,
  statement: ConditionalBlock,
  runtime: Runtime
): Promise<TailCallResult | null> {
  const condition = evaluate(statement.condition, runtime, statement.line);

  if (condition) {
    return await executeBlockAsync(program, statement.body, runtime);
  }
  return null;
}
