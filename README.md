# pi-diff

Side-by-side diff renderer for [pi](https://pi.dev)'s `edit` tool, inspired by opencode.

Replaces the default unified diff with two aligned columns:

```
edit src/App.vue
1   line 1                                                                     │ 1   line 1
2   line 2                                                                     │ 2   line 2
3 - line 3 to be changed                                                       │ 3 + line 3 changed
4   line 4                                                                     │ 4   line 4
```

## Install

```bash
pi install git:github.com/ernestoacevedo/pi-diff
```

Or locally:

```bash
pi install git:/path/to/pi-diff
```

Or during a single run:

```bash
pi -e ./pi-diff/extensions/side-by-side-diff.ts
```

## Features

- Delegates `execute` to pi's built-in `edit` tool (behavior unchanged).
- Renders additions/removals/context in two columns with line numbers.
- Falls back to pi's default unified diff on narrow terminals (<60 cols).

## Uninstall

```bash
pi remove git:github.com/ernestoacevedo/pi-diff
```
