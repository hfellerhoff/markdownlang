import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { createInterface } from 'readline';
import { parse } from './parser/index.js';
import { interpretAsync } from './interpreter/index.js';

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: markdownlang <file.md>');
    process.exit(1);
  }

  const filePath = args[0];
  const absolutePath = resolve(filePath);
  const baseDir = dirname(absolutePath);

  const markdown = readFileSync(absolutePath, 'utf-8');
  const program = parse(markdown);

  // Create readline interface for interactive input
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Input reader function that prompts user
  const inputReader = () => {
    return new Promise((resolve) => {
      rl.question('', (answer) => {
        resolve(answer);
      });
    });
  };

  // Print handler for immediate output
  const printHandler = (value) => {
    console.log(value);
  };

  interpretAsync(program, 'main', [], baseDir, inputReader, printHandler)
    .then(() => {
      rl.close();
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      rl.close();
      process.exit(1);
    });
}

main();
