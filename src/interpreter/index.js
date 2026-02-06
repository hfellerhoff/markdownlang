import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Runtime } from './runtime.js';
import { evaluate } from './evaluator.js';
import { parse } from '../parser/index.js';

// Cache for external programs to avoid re-parsing
const externalProgramCache = new Map();

/**
 * Load and parse an external markdown file
 */
function loadExternalProgram(filePath, baseDir) {
  const fullPath = resolve(baseDir, filePath);

  if (externalProgramCache.has(fullPath)) {
    return { program: externalProgramCache.get(fullPath), fullPath };
  }

  const markdown = readFileSync(fullPath, 'utf-8');
  const program = parse(markdown);
  program._baseDir = dirname(fullPath);
  externalProgramCache.set(fullPath, program);

  return { program, fullPath };
}

// Symbol to indicate a tail call
const TAIL_CALL = Symbol('TailCall');

/**
 * Interpret a Program AST
 */
export function interpret(program, entryPoint = 'main', args = [], baseDir = process.cwd(), inputs = []) {
  const runtime = new Runtime();
  runtime.setInput(inputs);
  program._baseDir = baseDir;

  // Find the entry function
  const mainFunc = program.functions[entryPoint];
  if (!mainFunc) {
    throw new Error(`Entry function '${entryPoint}' not found`);
  }

  // Execute with trampoline for tail call optimization
  let result = { type: TAIL_CALL, program, func: mainFunc, args, runtime };
  while (result && result.type === TAIL_CALL) {
    result = executeFunction(result.program, result.func, result.args, result.runtime);
  }

  return runtime.getOutput();
}

function executeFunction(program, func, args, runtime) {
  // Create argument bindings
  const argBindings = {};
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

function executeBlock(program, statements, runtime) {
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

function executeStatement(program, statement, runtime, isLast = false) {
  switch (statement.type) {
    case 'PrintStatement':
      executePrint(statement, runtime);
      return null;

    case 'AssignmentStatement':
      executeAssignment(statement, runtime);
      return null;

    case 'FunctionCallStatement':
      return executeFunctionCall(program, statement, runtime, isLast);

    case 'ConditionalBlock':
      return executeConditional(program, statement, runtime, isLast);

    case 'BreakStatement':
      runtime.setBreak();
      return null;

    case 'InputStatement':
      executeInput(statement, runtime);
      return null;

    default:
      throw new Error(`Unknown statement type: ${statement.type}`);
  }
}

function executeInput(statement, runtime) {
  const value = runtime.readInput();
  runtime.setVariable(statement.variable, value);
}

// Async input execution
async function executeInputAsync(statement, runtime) {
  const value = await runtime.readInputAsync();
  runtime.setVariable(statement.variable, value);
}

function executePrint(statement, runtime) {
  const value = evaluate(statement.expression, runtime);
  runtime.print(value);
}

function executeAssignment(statement, runtime) {
  const newValue = evaluate(statement.value, runtime);

  if (statement.operator) {
    // Compound assignment
    const currentValue = runtime.getVariable(statement.variable) ?? getDefaultValue(newValue);
    let result;

    switch (statement.operator) {
      case '+':
        result = currentValue + newValue;
        break;
      case '-':
        result = currentValue - newValue;
        break;
      case '*':
        result = currentValue * newValue;
        break;
      case '/':
        result = currentValue / newValue;
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

function getDefaultValue(value) {
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  return undefined;
}

function executeFunctionCall(program, statement, runtime, isLast = false) {
  let targetProgram = program;
  let func;

  if (statement.externalFile) {
    // Load external file
    const baseDir = program._baseDir || process.cwd();
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
  const args = statement.arguments.map(arg => evaluate(arg, runtime));

  // If this is a tail call (last statement in block), return thunk for trampoline
  if (isLast) {
    return { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  }

  // Otherwise execute normally with trampoline
  let result = { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  while (result && result.type === TAIL_CALL) {
    result = executeFunction(result.program, result.func, result.args, result.runtime);
  }
  return null;
}

function executeConditional(program, statement, runtime, isLast = false) {
  const condition = evaluate(statement.condition, runtime);

  if (condition) {
    return executeBlock(program, statement.body, runtime);
  }
  return null;
}

// Symbol to indicate async input needed
const ASYNC_INPUT = Symbol('AsyncInput');

/**
 * Interpret a Program AST asynchronously (supports interactive input)
 */
export async function interpretAsync(program, entryPoint = 'main', args = [], baseDir = process.cwd(), inputReader = null, printHandler = null) {
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
  let result = { type: TAIL_CALL, program, func: mainFunc, args, runtime };
  while (result && (result.type === TAIL_CALL || result.type === ASYNC_INPUT)) {
    if (result.type === ASYNC_INPUT) {
      await executeInputAsync(result.statement, runtime);
      result = result.continuation();
    } else {
      result = await executeFunctionAsync(result.program, result.func, result.args, result.runtime);
    }
  }

  return runtime.getOutput();
}

async function executeFunctionAsync(program, func, args, runtime) {
  // Create argument bindings
  const argBindings = {};
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

async function executeBlockAsync(program, statements, runtime) {
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

async function executeStatementAsync(program, statement, runtime, isLast = false) {
  switch (statement.type) {
    case 'PrintStatement':
      executePrint(statement, runtime);
      return null;

    case 'AssignmentStatement':
      executeAssignment(statement, runtime);
      return null;

    case 'FunctionCallStatement':
      return await executeFunctionCallAsync(program, statement, runtime, isLast);

    case 'ConditionalBlock':
      return await executeConditionalAsync(program, statement, runtime, isLast);

    case 'BreakStatement':
      runtime.setBreak();
      return null;

    case 'InputStatement':
      await executeInputAsync(statement, runtime);
      return null;

    default:
      throw new Error(`Unknown statement type: ${statement.type}`);
  }
}

async function executeFunctionCallAsync(program, statement, runtime, isLast = false) {
  let targetProgram = program;
  let func;

  if (statement.externalFile) {
    // Load external file
    const baseDir = program._baseDir || process.cwd();
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
  const args = statement.arguments.map(arg => evaluate(arg, runtime));

  // If this is a tail call (last statement in block), return thunk for trampoline
  if (isLast) {
    return { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  }

  // Otherwise execute normally with async trampoline
  let result = { type: TAIL_CALL, program: targetProgram, func, args, runtime };
  while (result && result.type === TAIL_CALL) {
    result = await executeFunctionAsync(result.program, result.func, result.args, result.runtime);
  }
  return null;
}

async function executeConditionalAsync(program, statement, runtime, isLast = false) {
  const condition = evaluate(statement.condition, runtime);

  if (condition) {
    return await executeBlockAsync(program, statement.body, runtime);
  }
  return null;
}
