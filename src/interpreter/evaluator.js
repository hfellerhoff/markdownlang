/**
 * Evaluate an expression AST node
 */
export function evaluate(node, runtime) {
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Identifier':
      return runtime.getVariable(node.name);

    case 'BinaryExpression':
      return evaluateBinaryExpression(node, runtime);

    case 'UnaryExpression':
      return evaluateUnaryExpression(node, runtime);

    case 'TemplateLiteral':
      return evaluateTemplateLiteral(node, runtime);

    case 'MemberExpression':
      return evaluateMemberExpression(node, runtime);

    case 'CallExpression':
      // Handle built-in functions if needed
      throw new Error(`Call expressions not supported: ${node.callee?.name}`);

    default:
      throw new Error(`Unknown expression type: ${node.type}`);
  }
}

function evaluateBinaryExpression(node, runtime) {
  const left = evaluate(node.left, runtime);
  const right = evaluate(node.right, runtime);

  switch (node.operator) {
    // Arithmetic
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return left / right;
    case '%':
      return left % right;

    // Comparison
    case '==':
      return left == right;
    case '!=':
      return left != right;
    case '<':
      return left < right;
    case '>':
      return left > right;
    case '<=':
      return left <= right;
    case '>=':
      return left >= right;
    case '===':
      return left === right;
    case '!==':
      return left !== right;

    // Logical
    case '&&':
      return left && right;
    case '||':
      return left || right;

    default:
      throw new Error(`Unknown operator: ${node.operator}`);
  }
}

function evaluateUnaryExpression(node, runtime) {
  const argument = evaluate(node.argument, runtime);

  switch (node.operator) {
    case '!':
      return !argument;
    case '-':
      return -argument;
    case '+':
      return +argument;
    default:
      throw new Error(`Unknown unary operator: ${node.operator}`);
  }
}

function evaluateTemplateLiteral(node, runtime) {
  let result = '';
  for (const part of node.parts) {
    if (part.type === 'literal') {
      result += part.value;
    } else if (part.type === 'expression') {
      result += evaluate(part.expr, runtime);
    }
  }
  return result;
}

function evaluateMemberExpression(node, runtime) {
  const object = evaluate(node.object, runtime);

  if (node.computed) {
    // word[i] - computed property access
    const property = evaluate(node.property, runtime);
    return object[property];
  } else {
    // word.length - dot notation
    return object[node.property.name];
  }
}
