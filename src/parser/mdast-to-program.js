import { parseExpression } from './expression-parser.js';

/**
 * Stage 2: Transform mdast to Program AST
 */
export function mdastToProgram(mdast) {
  const program = {
    type: 'Program',
    functions: {}
  };

  let currentFunction = null;
  let currentBlock = null; // The current block we're adding statements to

  for (const node of mdast.children) {
    if (node.type === 'heading' && node.depth === 1) {
      // Function declaration: # name
      const funcName = extractText(node);
      currentFunction = {
        type: 'FunctionDeclaration',
        name: funcName,
        parameters: [],
        body: []
      };
      currentBlock = currentFunction.body;
      program.functions[funcName] = currentFunction;
    } else if (node.type === 'heading' && node.depth === 2 && currentFunction) {
      // Conditional block: ## *condition*
      const conditionText = extractEmphasisText(node);
      if (conditionText) {
        const conditional = {
          type: 'ConditionalBlock',
          condition: parseExpression(conditionText),
          body: []
        };
        currentFunction.body.push(conditional);
        currentBlock = conditional.body;
      }
    } else if (node.type === 'list' && !node.ordered && currentFunction) {
      // Parameter declarations: - varname
      for (const item of node.children) {
        const paramName = extractText(item);
        currentFunction.parameters.push(paramName);
      }
    } else if (node.type === 'paragraph' && currentBlock) {
      const statement = parseParagraph(node);
      if (statement) {
        currentBlock.push(statement);
      }
    } else if (node.type === 'thematicBreak' && currentFunction) {
      // Break statement: --- adds break to current block and resets to function body
      if (currentBlock) {
        currentBlock.push({ type: 'BreakStatement' });
      }
      currentBlock = currentFunction.body;
    }
  }

  return program;
}

/**
 * Extract plain text from an mdast node
 */
function extractText(node) {
  let text = '';
  if (node.value) {
    text += node.value;
  }
  if (node.children) {
    for (const child of node.children) {
      text += extractText(child);
    }
  }
  return text.trim();
}

/**
 * Extract text from emphasis (*text*) within a node
 */
function extractEmphasisText(node) {
  for (const child of node.children || []) {
    if (child.type === 'emphasis') {
      return extractText(child);
    }
  }
  return null;
}

/**
 * Parse a paragraph into a statement
 */
function parseParagraph(node) {
  const children = node.children || [];

  // Check for print statement: **{expr}** or **text**
  if (children.length === 1 && children[0].type === 'strong') {
    const strongText = extractText(children[0]);
    // Check if expression is wrapped in {expr}
    const match = strongText.match(/^\{(.+)\}$/);
    if (match) {
      return {
        type: 'PrintStatement',
        expression: parseExpression(match[1])
      };
    }
    // Otherwise treat as literal string
    return {
      type: 'PrintStatement',
      expression: { type: 'Literal', value: strongText }
    };
  }

  // Check for function call: [args](#func)
  if (children.length === 1 && children[0].type === 'link') {
    const link = children[0];
    const funcName = link.url.replace(/^#/, '');
    const argsText = extractText(link);
    const args = argsText ? argsText.split(',').map(a => parseExpression(a.trim())) : [];
    return {
      type: 'FunctionCallStatement',
      functionName: funcName,
      arguments: args
    };
  }

  // Otherwise, it's an assignment: varname += expr or varname = expr
  const text = extractText(node);

  // Match compound assignment: varname += expr
  const compoundMatch = text.match(/^(\w+)\s*(\+|\-|\*|\/)?=\s*(.+)$/);
  if (compoundMatch) {
    const [, varName, operator, valueStr] = compoundMatch;
    return {
      type: 'AssignmentStatement',
      variable: varName,
      operator: operator || null,
      value: parseExpression(valueStr)
    };
  }

  return null;
}
