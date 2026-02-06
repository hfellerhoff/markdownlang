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

/**
 * Interpret a Program AST
 */
export function interpret(program, entryPoint = 'main', args = [], baseDir = process.cwd()) {
  const runtime = new Runtime();
  program._baseDir = baseDir;

  // Find the entry function
  const mainFunc = program.functions[entryPoint];
  if (!mainFunc) {
    throw new Error(`Entry function '${entryPoint}' not found`);
  }

  // Execute the entry function
  executeFunction(program, mainFunc, args, runtime);

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
  executeBlock(program, func.body, runtime);

  // Pop call frame
  runtime.popFrame();
}

function executeBlock(program, statements, runtime) {
  for (const statement of statements) {
    if (runtime.breakFlag) {
      break;
    }
    executeStatement(program, statement, runtime);
  }
}

function executeStatement(program, statement, runtime) {
  switch (statement.type) {
    case 'PrintStatement':
      executePrint(statement, runtime);
      break;

    case 'AssignmentStatement':
      executeAssignment(statement, runtime);
      break;

    case 'FunctionCallStatement':
      executeFunctionCall(program, statement, runtime);
      break;

    case 'ConditionalBlock':
      executeConditional(program, statement, runtime);
      break;

    case 'BreakStatement':
      runtime.setBreak();
      break;

    default:
      throw new Error(`Unknown statement type: ${statement.type}`);
  }
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

function executeFunctionCall(program, statement, runtime) {
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

  // Execute function
  executeFunction(targetProgram, func, args, runtime);
}

function executeConditional(program, statement, runtime) {
  const condition = evaluate(statement.condition, runtime);

  if (condition) {
    executeBlock(program, statement.body, runtime);
  }
}
