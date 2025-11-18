# Project Summary

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/vedalai/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

Refer to `docs/ARCHITECTURE.md` for a technical overview of the project's architecture.

`docs/ROADMAP.md` contains the current development goals. Keep these in mind when implementing or planning.

## Agent Development Guidelines

### Frontend

Current LLMs are likely to output outdated Svelte code that uses legacy features like implicit reactivity or `$:` statements. Svelte 5 has changed drastically from the previous versions, so review `docs/svelte5.md` and the [Svelte 5 docs](https://svelte.dev/docs) for a refresher on the new runes-based model.

Additionally, since this is a frontend for an entirely client-side app, no server-side code patterns will work. The app will render in the user's system WebView, which means Node is also not available, and system calls are handled through IPC messages to Tauri (e.g. filesystem access is handled through the `@tauri-apps/plugin-fs` Tauri plugin).

#### Miscellaneous Frontend Tips

Explore `app/src/lib/app/utils/` for commonly reused functionality.

Avoid Tailwind class soup (long class strings) and prefer explicit CSS classes with `@apply` directives:
```svelte
<script lang="ts"></script>

<div class="my-component" />

<style lang="postcss">
    /* references are required to recognize some directives */
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";
    @reference "@skeletonlabs/skeleton/themes/cerberus";

    .my-component {
        /* group directives by layout, bg/text colors, border/shadow/ring, etc */
        @apply flex items-center gap-2 px-4 py-2 rounded-md;
        @apply border border-neutral-200 dark:border-neutral-700;
        @apply bg-neutral-100 dark:bg-neutral-900/70;
        /* instead of soup like `hover:a1 hover:b1 hover:dark:a2 hover:dark:b2`, use a nested CSS selector */
        &:hover {
            /* no modifier inside */
            @apply bg-neutral-200 dark:bg-neutral-800/70;
        }
    }
</style>
```

#### neverthrow

Neverthrow documentation is available at `docs/neverthrow.md`. Read the first 20 lines for a cheatsheet, the first 120 for basic usage, or the whole file for a full reference.

When implementing fallible operations:
- Generally, prefer `Result.fromThrowable`/`ResultAsync.fromThrowable`/`ResultAsync.fromPromise` instead of try/catch; stylistically, use whatever fits in the existing code
    - `ResultAsync.fromPromise` is for regular promise code; `fromThrowable` is for code that may throw synchronously (before the promise first suspends)
- Functions marked `async` must return `Promise<Result<T, E>>` by JavaScript rules; otherwise, prefer `Result<T, E>`/`ResultAsync<T, E>` instead.
- Handle errors immediately - return the error, passing it up; or, if the caller doesn't expect a Result, send a log/toast and swallow it
- The point of `neverthrow` is to avoid throwing. Functions returning `Result` or `ResultAsync` should **never** throw. If you see a `throw` statement inside one of those that's not paired with an extremely good justification, report it immediately as a bug.

#### Zod

Zod use should follow these conventions:
- Schemas should be named `zSomeType`; omit "Schema" from the name since the `z` prefix makes it obvious
- Prefer `strictObject` over `object` unless extra fields are explicitly meant to be allowed
- For discriminated unions, use our `zConst` utility (that combines `z.literal` and `z.default`) to make object creation easy - e.g. with it, we can just use `zMyUnionMemberSubtype.decode({})` and omit the discriminator field entirely. Do note that `.decode({})` is not acceptable for validating values coming from outside.
- When constructing objects in code from literals, prefer `zMyType.decode(input)` as it enables type checking whereas the `zMyType.parse(input)` parameter is typed as `unknown`. Use `parse` for outside input.

### Backend

The Rust side should handle as little as possible to keep the majority of app logic concentrated in just TypeScript (for maintainability). The only things that must be handed over to Rust are system calls and things that aren't possible to do on the frontend; for example, we can't host a WebSocket server from the system WebView, so we must use Rust for that. But, since the Rust side should stay out of app logic, it just forwards messages to the frontend and does not handle any of them.

This means that, in general, your changes should stay in the frontend.
