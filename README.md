An implementation of a theoretical, markdown-based programming language.

Key concepts include:

- headings as scope / implicit function names
- italics → conditionals
- bold → print to console
- links → function calling via filename + heading link, link content passes parameter values
  - supports external files as well
- unordered lists → define variables
- horizontal rules → break statements
- quotes → wait for input from user on std in and assign response to a variable

Run programs with:

```
pnpm start filename.md
```

or prepare your own interpreter executable with

```
pnpm build && chmod +x ./mdl
```

and run any markdown program you wish with

```
./mdl filename.md
```
