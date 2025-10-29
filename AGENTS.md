# Project Summary

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/vedalai/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

Refer to `docs/ARCHITECTURE.md` for a technical overview of the project's architecture.

`docs/ROADMAP.md` contains the current development goals. Keep these in mind when implementing or planning.

## Agent Development Guidelines

### Frontend

Current LLMs are likely to output outdated Svelte code that uses legacy features like implicit reactivity or `$:` statements. Svelte 5 has changed drastically from the previous versions, so review `docs/svelte5.md` and the [Svelte 5 docs](https://svelte.dev/docs) for a refresher on the new runes-based model.

Additionally, since this is a frontend for an entirely client-side app, no server-side code patterns will work. It will render in the user's system WebView, which means Node is also not available, and system calls are handled through IPC messages to Tauri (e.g. filesystem access is handled through the `@tauri-apps/plugin-fs` Tauri plugin).

#### Frontend Tips
Avoid Tailwind class soup (e.g. 30 classes + 15 more `dark:` + 15 more `hover:`) and prefer explicit CSS classes with `@apply` directives; e.g.:
```svelte
<script lang="ts>
</script>

<div class="my-component" />

<style>
    .my-component {
        @apply flex items-center gap-2 px-4 py-2 rounded-md
            border border-neutral-200 bg-neutral-100
            dark:border-neutral-700 dark:bg-neutral-900/70;
        &:hover {
            @apply bg-neutral-200 dark:bg-neutral-800/70;
        }
    }
</style>
```

#### Zod

Zod use should follow these conventions:
- Schemas should be named `zSomeType`; omit "Schema" from the name since the `z` prefix makes it obvious
- Prefer `strictObject` over `object` unless extra fields are explicitly meant to be allowed
- For discriminated unions, use our `zConst` utility (that combines `z.literal` and `z.default`) to make object creation easy - e.g. with it, we can just use `zMyUnionMemberSubtype.decode({})` and omit the discriminator field entirely. Do note that `.decode({})` is not acceptable for validating values coming from outside.
- When constructing objects in code from literals, prefer `zMyType.decode(input)` as it enables type checking whereas the `zMyType.parse(input)` parameter is typed as `unknown`. Use `parse` for outside input.

### Backend

The Rust side should handle as little as possible to keep the majority of app logic concentrated in just TypeScript (for maintainability). The only things that must be handed over to Rust are system calls and things that aren't possible to do on the frontend; for example, we can't host a WebSocket server from the system WebView, so we must use Rust for that. But, since the Rust side should stay out of app logic, it just forwards messages to the frontend and does not handle any of them.

### Agent Specific Workflows

Follow any instructions specific to you in this section.

#### Google Gemini

Adopt the "Gather, Plan, Act" workflow.
1. First, gather the necessary information to fulfill the user's request. The general rule is: the more, the better. Get a full picture of the background behind the user's request and all parts of the system that interact with it. If the system seems critically important or tightly coupled, investigate an additional hop away from it to understand all potential knock-on effects.
2. Then, outline the changes you intend to make. Do not make the changes yet. This is your chance to notice and consider any edge cases, oddities, and potential knock-on effects. You *may* create Markdown files to help you keep track of your tasks or notes. Use high-level pseudocode for the outline. This will point you towards where you may need to investigate further. If you're not confident, go back to step 1 to refine the plan.
3. Once you are satisfied with the plan, ask the user to approve it. Then, provided all is well, you're free to start building. If you encounter something unexpected or difficult, evaluate whether to push through or go back to step 1 and try again with the new information. If all else fails, don't be afraid to ask the user for help or other collaboration.

Stay focused on the given task. Do what the user asks and no more (or less).
