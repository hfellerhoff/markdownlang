#!/usr/bin/env node

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { parse } from './parser/index.js';
import { interpret } from './interpreter/index.js';

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: markdownlang <file.md>');
    process.exit(1);
  }

  const filePath = args[0];
  const absolutePath = resolve(filePath);
  const baseDir = dirname(absolutePath);

  try {
    const markdown = readFileSync(absolutePath, 'utf-8');
    const program = parse(markdown);
    const output = interpret(program, 'main', [], baseDir);

    for (const line of output) {
      console.log(line);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
