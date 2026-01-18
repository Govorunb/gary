# Project Summary

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/vedalai/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

Before you start your task, refer to `docs/ARCHITECTURE.md` for a technical overview of the project's architecture.

## Agent Development Guidelines

### General

For tasks that involve the whole codebase, you should break them up (by file/directory/etc) and delegate the chunks to subagents.
When you run a task in a subagent, start your prompt with "I am an agent [doing X task]. You are a subagent performing a subtask." so the subagent will know. If you see this in the prompt, it means you're the subagent and you're meant to directly do the task.

Always look for examples of how a component is used in the codebase before you write code that uses it.

### Documentation

Always refer to `docs/llm-ref/writing.md` when writing or reviewing plans, docs, or other kinds of prose content.

### Frontend

Current LLMs are likely to output outdated Svelte code that uses legacy features like implicit reactivity or `$:` statements. Svelte 5 has changed drastically from the previous versions, so review `docs/llm-ref/svelte5.md` and the [Svelte 5 docs](https://svelte.dev/docs) for a refresher on the new runes-based model.

Additionally, since this is a frontend for an entirely client-side app, no server-side code patterns will work. The app will render in the user's system WebView, which means Node is also not available, and system calls are handled through IPC messages to Tauri (e.g. filesystem access is handled through the `@tauri-apps/plugin-fs` Tauri plugin).

Always read `src/global.css` when doing UI work.

#### Miscellaneous Frontend Tips

Explore `src/lib/app/utils/` for commonly reused functionality.

Avoid Tailwind class soup (long class strings) and prefer explicit CSS classes with `@apply` directives:
```svelte
<script lang="ts">
    ...
</script>

<div class="my-component" />

<style lang="postcss">
    @reference "global.css";

    .my-component {
        /* group directives by layout, bg/text colors, border/shadow/ring, etc */
        @apply px-4 py-2 rounded-md; /* self layout */
        @apply frow-2 items-center; /* children layout */
        @apply border border-neutral-200 dark:border-neutral-700;
        @apply bg-neutral-100 dark:bg-neutral-900/70;
        /* instead of soup like `hover:a1 hover:b1 hover:dark:a2 hover:dark:b2`, use a nested CSS selector */
        &:hover {
            /* no `hover:` modifier inside */
            @apply bg-neutral-200 dark:bg-neutral-800/70;
        }
    }
</style>
```

#### neverthrow

Neverthrow documentation is available at `docs/llm-ref/neverthrow.md`. Read the first 20 lines for a cheatsheet, the first 120 for basic usage, or the whole file for a full reference.

When implementing fallible operations:
- Generally, prefer `Result.fromThrowable`/`ResultAsync.fromThrowable`/`ResultAsync.fromPromise` instead of try/catch; stylistically, use whatever fits in the existing code
    - `ResultAsync.fromPromise` is for regular promise code; `fromThrowable` is for code that may throw synchronously (before the promise first suspends)
- Functions marked `async` must return `Promise<Result<T, E>>` by JavaScript rules; otherwise, prefer `Result<T, E>`/`ResultAsync<T, E>` instead.
- Handle errors immediately - return the error, passing it up; or, if the caller doesn't expect a Result, send a log/toast and swallow it
- The point of `neverthrow` is to avoid throwing. Functions returning `Result` or `ResultAsync` should **never** throw. If you see a `throw` statement inside one of those that's not paired with an extremely good justification, report it immediately as a bug.

We have neverthrow utility wrappers over common commands (exported from `$lib/app/utils`):
- `JSON.parse(text)` -> `jsonParse(text)`
- Zod `zodSchema.safeParse(obj)` -> `safeParse(zodSchema, obj)`
- Tauri `invoke(command, data)` -> `safeInvoke(command, data)`

#### Zod

Zod use should follow these conventions:
- Schemas should be named `zSomeType`; omit "Schema" from the name since the `z` prefix makes it obvious
- Prefer `strictObject` over `object` unless extra fields are explicitly meant to be allowed
- When constructing objects in code from literals, prefer `zMyType.decode(input)` as it enables type checking whereas the `zMyType.parse(input)` parameter is typed as `unknown`. Use `parse` for outside input.

#### Svelte + Skeleton UI

Svelte scopes CSS to the component - at compile time, a class like `.my-class` is transformed into e.g. `.random-id-unique-by-component.my-class` in the generated HTML and CSS rules.
On the other hand, props on components *are not HTML props* - `class` may eventually be applied to a real HTML element, but because of this CSS scoping the compiled selector will not apply to the nested component's elements. To get around this, you need to:
1. "Consume" the CSS class in the same component by passing in a `{#snippet}` if the child component accepts one;
2. Or, use the `:global` selector, e.g. `:global(.my-class)`. To avoid polluting global styles, `:global` must be nested inside another, more specific selector. You should generally prefer option 1 if possible.

```svelte
<!-- Incorrect -->
<Tooltip.Trigger class="tooltip-trigger">
    ...
</Tooltip.Trigger>

<!-- Do this instead -->
<Tooltip.Trigger>
    {#snippet element(props)}
        <!-- Tooltip specifically requires a button, but this may be another element - check for other examples in the codebase -->
        <button {...props} class="tooltip-trigger">
            ...
        </button>
    {/snippet}
    <p>Tooltip content</p>
</Tooltip.Trigger>

<!-- Alternative -->
 <div class="some-other-div">
    ...
    <Tooltip.Trigger class="tooltip-trigger">
        ...
    </Tooltip.Trigger>
    ...
</div>

<style lang="postcss">
@reference "global.css";

.tooltip-trigger {
    ...
}
/* alternative - make sure the selector is specific */
.some-other-div {
    ...
    /* CSS nesting is widely available in all browsers */
    & :global(.tooltip-trigger) {
        ...
    }
}
</style>
```

Additionally, Skeleton UI brings several built-in CSS classes like `btn` or `preset-tonal-surface`, so you may see them be used without a matching definition in the component's `<style>` tag. You do not need to define them separately. If in doubt, ask the user. Note: they are *not Tailwind directives*, and do not work with `@apply`. They must be placed inside the `class` property.

One last thing about Skeleton UI: its theme also defines three common colors - `primary`, `secondary`, and `tertiary`. We use them to denote how "advanced" an action is - `primary` for normal flow, `secondary` for more advanced actions, and `tertiary` for cutting-edge, "you are in the weeds"-type stuff.

### Backend

The Rust side should handle as little as possible to keep the majority of app logic concentrated in just TypeScript (for maintainability). The only things that must be handed over to Rust are system calls and things that aren't possible to do on the frontend; for example, we can't host a WebSocket server from the system WebView, so we must use Rust for that. But, since the Rust side should stay out of app logic, it just forwards messages to the frontend and does not handle any of them.

This means that, in most cases, your changes should stay in the frontend.
