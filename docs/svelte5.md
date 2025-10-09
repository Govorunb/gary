# Svelte 5 Guide for Agents

This document provides essential information for AI agents working with Svelte 5 to avoid outputting outdated Svelte 4 code patterns.

## Core Changes in Svelte 5

### 1. Runes System - The New Reactivity Model

Svelte 5 introduces **runes** - functions with a `$` prefix that control reactivity:

- **`$state()`** - Creates reactive state (replaces implicit `let` reactivity)
- **`$derived()`** - Creates computed/derived values (replaces `$:` statements)
- **`$effect()`** - Creates side effects (replaces side-effect `$:` statements)
- **`$props()`** - Declares component props (replaces `export let`)

### 2. Key Patterns

#### State Management
```svelte
<!-- Svelte 4 -->
<script>
  let count = 0;  // Implicitly reactive
</script>

<!-- Svelte 5 -->
<script>
  let count = $state(0);  // Explicitly reactive
</script>
```

#### Computed Values
```svelte
<!-- Svelte 4 -->
<script>
  let count = 0;
  $: double = count * 2;  // Computed value
</script>

<!-- Svelte 5 -->
<script>
  let count = $state(0);
  let double = $derived(count * 2);  // Computed value
</script>
```

#### Side Effects
```svelte
<!-- Svelte 4 -->
<script>
  let count = 0;
  $: if (count > 5) {
    console.log('Count is high!');
  }
</script>

<!-- Svelte 5 -->
<script>
  let count = $state(0);
  $effect(() => {
    if (count > 5) {
      console.log('Count is high!');
    }
  });
</script>
```

#### Component Props
```svelte
<!-- Svelte 4 -->
<script>
  export let name;
  export let age = 25;
</script>

<!-- Svelte 5 -->
<script>
  let { name, age = 25 } = $props();
</script>
```

### 3. Component Props with Advanced Patterns

#### Renaming Props
```svelte
<!-- Svelte 4 -->
<script>
  export let className;
  export { className as class };
</script>

<!-- Svelte 5 -->
<script>
  let { class: className } = $props();
</script>
```

#### Rest Props
```svelte
<!-- Svelte 4 -->
<script>
  export let primary = true;
  // Other props available via $$restProps
</script>

<!-- Svelte 5 -->
<script>
  let { primary = true, ...rest } = $props();
</script>
```


## Important Notes for Agents

1. **Always use explicit runes** - Never assume `let` declarations are reactive
2. **Props are destructured** - Use `$props()` and destructuring syntax
3. **No more stores for simple state** - Use `$state()` instead of writable stores for component state
4. **Events are attributes** - Use `onclick` instead of `on:click` for DOM events
5. **Snippets replace slots** - Use `{#snippet}` blocks instead of `<slot>` elements

## Why These Changes?

- **Explicit over implicit**: Makes reactivity behavior predictable
- **Universal reactivity**: Same patterns work in components and `.svelte.js` files
- **Better tooling**: TypeScript-friendly and easier for editors to understand
- **Reduced gotchas**: Fixes ordering issues and stale value problems from Svelte 4

## Example: Complete Component Migration

```svelte
<!-- Svelte 4 Component -->
<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';

  export let title = 'Hello';
  export let items = [];

  const store = writable(0);
  let count = 0;
  $: doubled = count * 2;

  $: if (count > 10) {
    console.log('High count!');
  }

  onMount(() => {
    console.log('Mounted');
  });

  function increment() {
    count++;
    store.update(n => n + 1);
  }
</script>

<h1>{title}</h1>
<button on:click={increment}>Click me</button>
<p>Count: {count}, Doubled: {doubled}</p>

<!-- Svelte 5 Component -->
<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';

  let { title = 'Hello', items = [] } = $props();

  const store = writable(0);
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    if (count > 10) {
      console.log('High count!');
    }
  });

  onMount(() => {
    console.log('Mounted');
  });

  function increment() {
    count++;
    store.update(n => n + 1);
  }
</script>

<h1>{title}</h1>
<button onclick={increment}>Click me</button>
<p>Count: {count}, Doubled: {doubled}</p>
```

## Resources

- [Svelte 5 Documentation](https://svelte.dev/docs/svelte)
- [Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)

Remember: Svelte 5 is backward compatible - old Svelte 4 syntax still works, but new code should use the runes API for better performance and maintainability.
