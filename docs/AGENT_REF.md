# Agent Development Tips

This document assumes you have read the [architecture docs](/docs/ARCHITECTURE.md) for the app.

## Frontend

Since this is a frontend for an entirely client-side app, no server-side code patterns will work. The app will render in the user's system WebView, which means Node is also not available, and system calls are handled through IPC messages to Tauri.

Always read `src/global.css` when doing UI work.

#### Miscellaneous Frontend Tips

Explore `src/lib/app/utils/` for commonly reused functionality.

Prefer tests with durable value over low-level setter/getter coverage.
- Good test targets:
  - Self-contained utility functions defined by their inputs, e.g. `toStepPrecision` in `src/lib/app/utils/index.ts`
  - Integration tests that lock down cross-system behavior, e.g. `src/lib/api/diagnostics.test.ts`
- Poor default test targets:
  - Bottom-layer unit tests that only prove that a line of code executes as written (setter gets called, boolean is flipped, etc)
  - String-matching tests for string constants - they are usually a poorly abstracted proxy for testing the actual behavior that manipulates the strings
- Rule of thumb:
  - If the behavior is obvious from one local implementation and cheap to re-derive, do not add a dedicated unit test for it
  - If the behavior is easy to forget, easy to break indirectly, or defined by many inputs/interactions, a test is usually justified
  - Tests help us confidently forget code that *should* be forgotten to free up the mental model - `toStepPrecision` is a perfect example

Avoid Tailwind class soup (long class strings) and prefer explicit CSS classes with `@apply` directives. Group directives logically by layout, BG/text colors, border/shadow/ring, etc. Instead of combinatorical soup like `hover:a1 hover:b1 hover:dark:a2 hover:dark:b2`, use a nested CSS selector (`&:hover {}`).

#### neverthrow

Inspect the installed package's types or source when you need API details.

When implementing fallible operations:
- Generally, prefer `Result.fromThrowable`/`ResultAsync.fromThrowable`/`ResultAsync.fromPromise` instead of try/catch; stylistically, use whatever fits in the existing code
    - `ResultAsync.fromPromise` is for regular promise code; `fromThrowable` is for code that may throw synchronously (before the promise first suspends)
- Functions marked `async` must return `Promise<Result<T, E>>` by JavaScript rules; otherwise, prefer `Result<T, E>`/`ResultAsync<T, E>` instead.
- Handle errors immediately - return the error, passing it up; or, if the caller doesn't expect a Result, publish it on the event bus as a warning/error event and swallow it locally
- The point of `neverthrow` is to avoid throwing. Functions returning `Result` or `ResultAsync` should **never** throw. Report pre-existing violations when relevant to the task.

We have neverthrow utility wrappers over common commands (exported from `$lib/app/utils`):
- `JSON.parse(text)` -> `jsonParse(text)`
- Zod `zodSchema.safeParse(obj)` -> `safeParse(zodSchema, obj)`
- Tauri `invoke(command, data)` -> `safeInvoke(command, data)`

#### Zod

Zod use should follow these conventions:
- Prefer `strictObject` over `object` unless extra fields are explicitly meant to be allowed
- When constructing objects in code from literals, prefer `zMyType.decode(input)` as it enables type checking whereas the `zMyType.parse(input)` parameter is typed as `unknown`. Use `parse` for outside input.

#### Svelte + Skeleton UI

Skeleton UI brings several built-in CSS classes like `btn` or `preset-tonal-surface`, so you may see them be used without a matching definition in the component's `<style>` tag. You do not need to define them separately. If in doubt, directly inspect the installed Skeleton package. Note: they are raw CSS classes and not Tailwind utilities - they do not work with `@apply` and must be placed in `class`.

Skeleton UI's theme also defines three common colors - `primary`, `secondary`, and `tertiary`. We use them to denote how "advanced" an action is - `primary` for normal flow, `secondary` for more advanced actions, and `tertiary` for cutting-edge, "you are in the weeds"-type stuff.
