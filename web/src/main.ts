import { parse } from '../../src/parser/index.ts';
import { interpretAsync } from '../../src/interpreter/index.ts';
import type { RuntimeValue } from '../../src/types.ts';

import fizzbuzz from '../../examples/fizzbuzz.md?raw';
import helloWorld from '../../examples/hello-world.md?raw';
import palindrome from '../../examples/palindrome.md?raw';
import typeError from '../../examples/errors/type-error.md?raw';
import undeclaredError from '../../examples/errors/undeclared-error.md?raw';

const EXAMPLES: Record<string, string> = {
  'fizzbuzz': fizzbuzz,
  'hello-world': helloWorld,
  'palindrome': palindrome,
  'type-error': typeError,
  'undeclared-error': undeclaredError,
};

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const output = document.getElementById('output') as HTMLDivElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const examplesSelect = document.getElementById('examples') as HTMLSelectElement;

editor.value = EXAMPLES['hello-world'];

examplesSelect.addEventListener('change', () => {
  const example = EXAMPLES[examplesSelect.value];
  if (example) {
    editor.value = example;
    output.textContent = '';
    output.classList.remove('error');
  }
});

function appendText(text: string) {
  output.appendChild(document.createTextNode(text));
  output.scrollTop = output.scrollHeight;
}

function inlineInput(): Promise<string> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-input';
    output.appendChild(input);
    input.focus();
    output.scrollTop = output.scrollHeight;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const value = input.value;
        input.disabled = true;
        input.classList.add('submitted');
        appendText('\n');
        resolve(value);
      }
    });
  });
}

async function run() {
  output.textContent = '';
  output.classList.remove('error');

  const source = editor.value;

  try {
    const program = parse(source);

    const printHandler = (value: RuntimeValue): void => {
      appendText(String(value) + '\n');
    };

    await interpretAsync(program, 'main', [], '', inlineInput, printHandler);
  } catch (err: unknown) {
    output.classList.add('error');
    appendText(err instanceof Error ? err.message : String(err));
  }
}

runBtn.addEventListener('click', run);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
});

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
  }
});
