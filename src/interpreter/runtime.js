/**
 * Runtime manages the call stack, variable scopes, and output
 */
export class Runtime {
  constructor() {
    this.callStack = [];
    this.output = [];
    this.breakFlag = false;
    this.inputBuffer = [];
    this.inputIndex = 0;
    this.printHandler = null; // For immediate output
  }

  /**
   * Set a handler for immediate print output
   */
  setPrintHandler(handler) {
    this.printHandler = handler;
  }

  /**
   * Set input buffer for reading (sync mode)
   */
  setInput(inputs) {
    this.inputBuffer = Array.isArray(inputs) ? inputs : [];
    this.inputIndex = 0;
  }

  /**
   * Set async input reader function
   */
  setInputReader(reader) {
    this.inputReader = reader;
  }

  /**
   * Read next input from buffer (sync mode)
   */
  readInput() {
    if (this.inputIndex < this.inputBuffer.length) {
      return this.inputBuffer[this.inputIndex++];
    }
    return null;
  }

  /**
   * Read input asynchronously
   */
  async readInputAsync() {
    if (this.inputReader) {
      return await this.inputReader();
    }
    return this.readInput();
  }

  /**
   * Push a new call frame onto the stack
   */
  pushFrame(functionName, args = {}) {
    this.callStack.push({
      functionName,
      variables: { ...args }
    });
  }

  /**
   * Pop the current call frame
   */
  popFrame() {
    return this.callStack.pop();
  }

  /**
   * Get the current call frame
   */
  currentFrame() {
    return this.callStack[this.callStack.length - 1];
  }

  /**
   * Get a variable value from current scope
   */
  getVariable(name) {
    const frame = this.currentFrame();
    if (frame && name in frame.variables) {
      return frame.variables[name];
    }
    return undefined;
  }

  /**
   * Set a variable in current scope
   */
  setVariable(name, value) {
    const frame = this.currentFrame();
    if (frame) {
      frame.variables[name] = value;
    }
  }

  /**
   * Add output
   */
  print(value) {
    this.output.push(value);
    // If there's a print handler, call it immediately
    if (this.printHandler) {
      this.printHandler(value);
    }
  }

  /**
   * Get all output
   */
  getOutput() {
    return this.output;
  }

  /**
   * Set the break flag
   */
  setBreak() {
    this.breakFlag = true;
  }

  /**
   * Check and clear break flag
   */
  shouldBreak() {
    if (this.breakFlag) {
      this.breakFlag = false;
      return true;
    }
    return false;
  }

  /**
   * Clear break flag (when exiting a conditional block)
   */
  clearBreak() {
    this.breakFlag = false;
  }
}
