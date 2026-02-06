import type {
  CallFrame,
  RuntimeValue,
  InputReader,
  PrintHandler,
  RuntimeInterface,
} from '../types.ts';

/**
 * Runtime manages the call stack, variable scopes, and output
 */
export class Runtime implements RuntimeInterface {
  callStack: CallFrame[] = [];
  output: RuntimeValue[] = [];
  breakFlag: boolean = false;
  inputBuffer: RuntimeValue[] = [];
  inputIndex: number = 0;
  inputReader: InputReader | null = null;
  printHandler: PrintHandler | null = null;

  /**
   * Set a handler for immediate print output
   */
  setPrintHandler(handler: PrintHandler): void {
    this.printHandler = handler;
  }

  /**
   * Set input buffer for reading (sync mode)
   */
  setInput(inputs: RuntimeValue[]): void {
    this.inputBuffer = Array.isArray(inputs) ? inputs : [];
    this.inputIndex = 0;
  }

  /**
   * Set async input reader function
   */
  setInputReader(reader: InputReader): void {
    this.inputReader = reader;
  }

  /**
   * Read next input from buffer (sync mode)
   */
  readInput(): RuntimeValue {
    if (this.inputIndex < this.inputBuffer.length) {
      return this.inputBuffer[this.inputIndex++];
    }
    return null;
  }

  /**
   * Read input asynchronously
   */
  async readInputAsync(): Promise<RuntimeValue> {
    if (this.inputReader) {
      return await this.inputReader();
    }
    return this.readInput();
  }

  /**
   * Push a new call frame onto the stack
   */
  pushFrame(functionName: string, args: Record<string, RuntimeValue> = {}): void {
    const declaredVariables = new Set<string>(Object.keys(args));
    this.callStack.push({
      functionName,
      variables: { ...args },
      declaredVariables
    });
  }

  /**
   * Pop the current call frame
   */
  popFrame(): CallFrame | undefined {
    return this.callStack.pop();
  }

  /**
   * Get the current call frame
   */
  currentFrame(): CallFrame | undefined {
    return this.callStack[this.callStack.length - 1];
  }

  /**
   * Get a variable value from current scope
   */
  getVariable(name: string): RuntimeValue {
    const frame = this.currentFrame();
    if (frame && name in frame.variables) {
      return frame.variables[name];
    }
    return undefined;
  }

  /**
   * Set a variable in current scope
   */
  setVariable(name: string, value: RuntimeValue): void {
    const frame = this.currentFrame();
    if (frame) {
      frame.variables[name] = value;
    }
  }

  /**
   * Declare and set a variable in current scope
   */
  declareVariable(name: string, value: RuntimeValue): void {
    const frame = this.currentFrame();
    if (frame) {
      frame.declaredVariables.add(name);
      frame.variables[name] = value;
    }
  }

  /**
   * Check if a variable is declared in current scope
   */
  isDeclared(name: string): boolean {
    const frame = this.currentFrame();
    if (frame) {
      return frame.declaredVariables.has(name);
    }
    return false;
  }

  /**
   * Add output
   */
  print(value: RuntimeValue): void {
    this.output.push(value);
    // If there's a print handler, call it immediately
    if (this.printHandler) {
      this.printHandler(value);
    }
  }

  /**
   * Get all output
   */
  getOutput(): RuntimeValue[] {
    return this.output;
  }

  /**
   * Set the break flag
   */
  setBreak(): void {
    this.breakFlag = true;
  }

  /**
   * Check and clear break flag
   */
  shouldBreak(): boolean {
    if (this.breakFlag) {
      this.breakFlag = false;
      return true;
    }
    return false;
  }

  /**
   * Clear break flag (when exiting a conditional block)
   */
  clearBreak(): void {
    this.breakFlag = false;
  }
}
