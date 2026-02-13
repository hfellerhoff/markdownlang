import { parse } from '@markdownlang/core/parser';
import { interpretAsync, clearExternalProgramCache } from '@markdownlang/core/interpreter';
import type { RuntimeValue } from '@markdownlang/core/types';
import { registerFile, clearFiles } from './node-stubs.ts';
import { marked } from 'marked';

import fizzbuzz from '@markdownlang/examples/fizzbuzz.md?raw';
import helloWorld from '@markdownlang/examples/hello-world.md?raw';
import palindrome from '@markdownlang/examples/palindrome.md?raw';
import kitchenSink from '@markdownlang/examples/kitchen-sink.md?raw';
import fileImport from '@markdownlang/examples/file-import/import-test.md?raw';
import fileImportLib from '@markdownlang/examples/file-import/lib.md?raw';
import remoteFileImport from '@markdownlang/examples/remote-file-import/import-test.md?raw';
import typeError from '@markdownlang/examples/errors/type-error.md?raw';
import undeclaredError from '@markdownlang/examples/errors/undeclared-error.md?raw';
import nestedConditionals from '@markdownlang/examples/nested-conditionals.md?raw';

interface Project {
  entry: string;
  files: { name: string; path: string; content: string }[];
}

const EXAMPLES: Record<string, Project> = {
  'hello-world': {
    entry: '/hello-world.md',
    files: [{ name: 'hello-world.md', path: '/hello-world.md', content: helloWorld }],
  },
  'kitchen-sink': {
    entry: '/kitchen-sink.md',
    files: [{ name: 'kitchen-sink.md', path: '/kitchen-sink.md', content: kitchenSink }],
  },
  'fizzbuzz': {
    entry: '/fizzbuzz.md',
    files: [{ name: 'fizzbuzz.md', path: '/fizzbuzz.md', content: fizzbuzz }],
  },
  'palindrome': {
    entry: '/palindrome.md',
    files: [{ name: 'palindrome.md', path: '/palindrome.md', content: palindrome }],
  },
  'nested-conditionals': {
    entry: '/nested-conditionals.md',
    files: [{ name: 'nested-conditionals.md', path: '/nested-conditionals.md', content: nestedConditionals }],
  },
  'file-import': {
    entry: '/import-test.md',
    files: [
      { name: 'import-test.md', path: '/import-test.md', content: fileImport },
      { name: 'lib.md', path: '/lib.md', content: fileImportLib },
    ],
  },
  'remote-file-import': {
    entry: '/import-test.md',
    files: [{ name: 'import-test.md', path: '/import-test.md', content: remoteFileImport }],
  },
  'type-error': {
    entry: '/type-error.md',
    files: [{ name: 'type-error.md', path: '/type-error.md', content: typeError }],
  },
  'undeclared-error': {
    entry: '/undeclared-error.md',
    files: [{ name: 'undeclared-error.md', path: '/undeclared-error.md', content: undeclaredError }],
  },
};

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const preview = document.getElementById('preview') as HTMLDivElement;
const output = document.getElementById('output') as HTMLDivElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const examplesSelect = document.getElementById('examples') as HTMLSelectElement;
const tabBar = document.getElementById('tab-bar') as HTMLDivElement;
const viewToggle = document.getElementById('view-toggle') as HTMLDivElement;
const fontSelect = document.getElementById('font-select') as HTMLSelectElement;
const scopeBg = document.getElementById('scope-bg') as HTMLDivElement;
const editorContainer = document.getElementById('editor-container') as HTMLDivElement;

const FONT_MAP: Record<string, string> = {
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
  hand: 'var(--font-hand)',
  barcode: "'Libre Barcode 39 Extended', system-ui",
  lines: "'Linefont', sans-serif",
  waves: "'Wavefont', sans-serif",
};

let currentFiles: { name: string; path: string; content: string }[] = [];
let activeFileIndex = 0;
let previewMode = false;

function toggleMode(mode: 'edit' | 'preview'): void {
  previewMode = mode === 'preview';
  const buttons = viewToggle.querySelectorAll('.view-toggle-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
  });

  if (previewMode) {
    currentFiles[activeFileIndex].content = editor.value;
    preview.innerHTML = marked(editor.value) as string;
    preview.style.fontFamily = FONT_MAP[fontSelect.value] || FONT_MAP.serif;
    editorContainer.style.display = 'none';
    preview.style.display = '';
  } else {
    editorContainer.style.display = '';
    preview.style.display = 'none';
    renderGutter();
  }
}

viewToggle.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.view-toggle-btn') as HTMLElement | null;
  if (!btn) return;
  const mode = btn.dataset.mode as 'edit' | 'preview';
  if ((mode === 'preview') !== previewMode) {
    toggleMode(mode);
  }
});

const title = document.querySelector('header h1') as HTMLElement;

function applyFont(value: string): void {
  const font = FONT_MAP[value] || FONT_MAP.serif;
  title.style.fontFamily = font;
  if (previewMode) {
    preview.style.fontFamily = font;
  }
}

fontSelect.addEventListener('change', () => {
  applyFont(fontSelect.value);
});

function computeScopes(text: string): number[] {
  const lines = text.split('\n');
  const depths: number[] = [];
  let depth = 0;
  let isFirstFunction = true;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      const count = headingMatch[1].length;
      if (count === 1) {
        if (!isFirstFunction) {
          // Walk back and set preceding blank lines to 0 (gap between functions)
          for (let i = depths.length - 1; i >= 0; i--) {
            if (lines[i].trim() === '') {
              depths[i] = 0;
            } else {
              break;
            }
          }
        }
        depth = 1;
        isFirstFunction = false;
      } else if (depth >= count - 1) {
        depth = count;
      }
    } else if (/^---\s*$|^\*\*\*\s*$|^___\s*$/.test(line)) {
      depth = Math.max(depth - 1, 1);
    }
    depths.push(depth);
  }

  return depths;
}

const BAR_PAD = 6;   // left offset for first bar
const BAR_STEP = 5;  // spacing per level (bar width + gap)

function renderGutter(): void {
  const depths = computeScopes(editor.value);
  let html = '';
  for (const d of depths) {
    html += '<div class="scope-bg-line">';
    for (let level = 1; level <= d; level++) {
      const left = BAR_PAD + (level - 1) * BAR_STEP;
      // scope bar
      html += `<span class="scope-bar level-${level}" style="left:${left}px"></span>`;
      // background band
      if (level === d) {
        html += `<span class="scope-bg-band level-${level}" style="left:${left}px;right:0"></span>`;
      } else {
        html += `<span class="scope-bg-band level-${level}" style="left:${left}px;width:${BAR_STEP}px"></span>`;
      }
    }
    html += '</div>';
  }
  scopeBg.innerHTML = html;
}

editor.addEventListener('scroll', () => {
  scopeBg.style.top = -editor.scrollTop + 'px';
});

editor.addEventListener('input', renderGutter);

function loadProject(key: string): void {
  const project = EXAMPLES[key];
  if (!project) return;
  currentFiles = project.files.map(f => ({ ...f }));
  activeFileIndex = 0;
  editor.value = currentFiles[0].content;
  renderGutter();
  toggleMode('preview');
  renderTabs();
}

function renderTabs(): void {
  tabBar.innerHTML = '';
  currentFiles.forEach((file, i) => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (i === activeFileIndex ? ' active' : '');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = file.name;
    tab.appendChild(nameSpan);

    if (currentFiles.length > 1) {
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.innerHTML = '&times;';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(i);
      });
      tab.appendChild(close);
    }

    tab.addEventListener('click', () => switchTab(i));
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(i, tab, nameSpan);
    });

    tabBar.appendChild(tab);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'tab-add';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', addFile);
  tabBar.appendChild(addBtn);

  const spacer = document.createElement('div');
  spacer.className = 'tab-spacer';
  tabBar.appendChild(spacer);

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'tab-download';
  downloadBtn.textContent = '\u2193 Download';
  downloadBtn.addEventListener('click', downloadFile);
  tabBar.appendChild(downloadBtn);
}

function switchTab(index: number): void {
  if (index === activeFileIndex) return;
  currentFiles[activeFileIndex].content = editor.value;
  activeFileIndex = index;
  editor.value = currentFiles[index].content;
  renderGutter();
  if (previewMode) toggleMode('edit');
  renderTabs();
}

function addFile(): void {
  currentFiles[activeFileIndex].content = editor.value;
  const existingNames = new Set(currentFiles.map(f => f.name));
  let name = 'untitled.md';
  let counter = 2;
  while (existingNames.has(name)) {
    name = `untitled-${counter}.md`;
    counter++;
  }
  currentFiles.push({ name, path: '/' + name, content: '' });
  activeFileIndex = currentFiles.length - 1;
  editor.value = '';
  renderTabs();
}

function removeFile(index: number): void {
  if (currentFiles.length <= 1) return;
  currentFiles[activeFileIndex].content = editor.value;
  currentFiles.splice(index, 1);
  if (index === activeFileIndex) {
    activeFileIndex = Math.min(index, currentFiles.length - 1);
  } else if (index < activeFileIndex) {
    activeFileIndex--;
  }
  editor.value = currentFiles[activeFileIndex].content;
  renderTabs();
}

function startRename(index: number, tabEl: HTMLElement, nameSpan: HTMLSpanElement): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-rename-input';
  input.value = currentFiles[index].name;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    renameFile(index, input.value);
  };
  const cancel = () => {
    renderTabs();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

function renameFile(index: number, rawName: string): void {
  let name = rawName.trim();
  if (!name) { renderTabs(); return; }
  if (!name.endsWith('.md')) name += '.md';
  const collision = currentFiles.some((f, i) => i !== index && f.name === name);
  if (collision) { renderTabs(); return; }
  currentFiles[index].name = name;
  currentFiles[index].path = '/' + name;
  renderTabs();
}

function downloadFile(): void {
  currentFiles[activeFileIndex].content = editor.value;
  const file = currentFiles[activeFileIndex];
  const blob = new Blob([file.content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

loadProject('hello-world');

examplesSelect.addEventListener('change', () => {
  loadProject(examplesSelect.value);
  output.textContent = '';
  output.classList.remove('error');
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

  // Save current editor content
  currentFiles[activeFileIndex].content = editor.value;

  // Reset VFS and re-register all project files
  clearFiles();
  for (const f of currentFiles) {
    registerFile(f.path, f.content);
  }
  clearExternalProgramCache();

  const source = currentFiles[0].content;

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
