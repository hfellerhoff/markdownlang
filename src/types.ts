import type { Expression } from 'jsep';

// Control flow symbols
export const TAIL_CALL: unique symbol = Symbol('TailCall');
export const ASYNC_INPUT: unique symbol = Symbol('AsyncInput');

// Runtime value type
export type RuntimeValue = string | number | boolean | null | undefined;

// Template literal parts
export interface LiteralPart {
  type: 'literal';
  value: string;
}

export interface ExpressionPart {
  type: 'expression';
  expr: Expression;
}

export type TemplatePart = LiteralPart | ExpressionPart;

// Custom expression type for template literals
export interface TemplateLiteralExpression {
  type: 'TemplateLiteral';
  parts: TemplatePart[];
}

// Source location for error messages
export interface SourceLocation {
  line: number;
}

// Statement types
export interface PrintStatement {
  type: 'PrintStatement';
  expression: Expression | TemplateLiteralExpression;
  line?: number;
}

export interface AssignmentStatement {
  type: 'AssignmentStatement';
  variable: string;
  operator: '+' | '-' | '*' | '/' | null;
  value: Expression;
  line?: number;
}

export interface FunctionCallStatement {
  type: 'FunctionCallStatement';
  functionName: string;
  externalFile: string | null;
  arguments: Expression[];
  line?: number;
}

export interface ConditionalBlock {
  type: 'ConditionalBlock';
  condition: Expression;
  body: Statement[];
  line?: number;
}

export interface BreakStatement {
  type: 'BreakStatement';
  line?: number;
}

export interface InputStatement {
  type: 'InputStatement';
  variable: string;
  line?: number;
}

export interface VariableDeclaration {
  type: 'VariableDeclaration';
  variable: string;
  value: Expression;
  line?: number;
}

export type Statement =
  | PrintStatement
  | AssignmentStatement
  | FunctionCallStatement
  | ConditionalBlock
  | BreakStatement
  | InputStatement
  | VariableDeclaration;

// Function declaration
export interface FunctionDeclaration {
  type: 'FunctionDeclaration';
  name: string;
  parameters: string[];
  body: Statement[];
}

// Program structure
export interface Program {
  type: 'Program';
  functions: Record<string, FunctionDeclaration>;
  _baseDir?: string;
}

// Call frame for runtime stack
export interface CallFrame {
  functionName: string;
  variables: Record<string, RuntimeValue>;
  declaredVariables: Set<string>;
}

// Input reader function type
export type InputReader = () => Promise<string>;

// Print handler function type
export type PrintHandler = (value: RuntimeValue) => void;

// Tail call result
export interface TailCallResult {
  type: typeof TAIL_CALL;
  program: Program;
  func: FunctionDeclaration;
  args: RuntimeValue[];
  runtime: RuntimeInterface;
}

// Async input result
export interface AsyncInputResult {
  type: typeof ASYNC_INPUT;
  statement: InputStatement;
  continuation: () => TailCallResult | null;
}

// Runtime interface
export interface RuntimeInterface {
  callStack: CallFrame[];
  output: RuntimeValue[];
  breakFlag: boolean;
  inputBuffer: RuntimeValue[];
  inputIndex: number;
  inputReader: InputReader | null;
  printHandler: PrintHandler | null;

  setPrintHandler(handler: PrintHandler): void;
  setInput(inputs: RuntimeValue[]): void;
  setInputReader(reader: InputReader): void;
  readInput(): RuntimeValue;
  readInputAsync(): Promise<RuntimeValue>;
  pushFrame(functionName: string, args?: Record<string, RuntimeValue>): void;
  popFrame(): CallFrame | undefined;
  currentFrame(): CallFrame | undefined;
  getVariable(name: string): RuntimeValue;
  setVariable(name: string, value: RuntimeValue): void;
  declareVariable(name: string, value: RuntimeValue): void;
  isDeclared(name: string): boolean;
  print(value: RuntimeValue): void;
  getOutput(): RuntimeValue[];
  setBreak(): void;
  shouldBreak(): boolean;
  clearBreak(): void;
}
