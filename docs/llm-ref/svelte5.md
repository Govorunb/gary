# Svelte 5 Guide for Agents

Many currently deployed LLMs have training cutoffs before (or shortly after) Svelte 5's release, leading to a lack of training data for Svelte 5. This document provides essential information for AI agents working with Svelte 5 to avoid writing outdated Svelte 4 code patterns.

## Core Changes in Svelte 5

### 1. Runes System - The New Reactivity Model

Svelte 5 introduces **runes** - functions with a `$` prefix that control reactivity:

- **`$state()`** - Reactive state (replaces implicit `let` reactivity)
- **`$derived()`** - Computed/derived values, recomputed when dependencies change (replaces `$:` statements)
- **`$effect()`** - Side effects that rerun when dependencies change (replaces side-effect `$:` statements)
- **`$props()`** - Declares component props (replaces `export let`)

### 2. Key Patterns

#### Reactive State and Side Effects
```svelte
<!-- Svelte 4 - outdated -->
<script lang="ts">
  const someValue = 0; // Non-reactive
  let count = 0;  // Implicitly reactive
  $: double = count * 2;  // Computed value
  // Side effect
  $: if (count > 5) {
    console.log('Count is high!');
  }
</script>

<!-- Svelte 5 - use this now -->
<script lang="ts">
  const someValue = 0; // Non-reactive
  let otherValue = 1; // Still non-reactive
  let count = $state(0);  // Explicitly reactive
  let double = $derived(count * 2);  // Computed value
  // Side effect
  $effect(() => {
    if (count > 5) {
      console.log('Count is high!');
    }
  });
</script>
```

#### Component Props
```svelte
<!-- Svelte 4 - outdated -->
<script lang="ts">
  export let name;
  export let age = 25; // Default value
  export { name as myName }; // Renaming props
  // Other props available via $$restProps
  // All props available via $$props
</script>

<!-- Svelte 5 - use this now -->
<script lang="ts">
  let {
    myName: name, // Renaming props
    age = 25, // Default value
    ...restProps // Other props
  } = $props();
  let props = $props(); // All props available by not destructuring
</script>
```

#### Events
```svelte
<!-- Svelte 4 - outdated -->
<script lang="ts">
  let count = 0;
  function onclick() {
    count++;
  }
</script>
<button on:click={onclick}>Clicks: {count}</button>

<!-- Svelte 5 - use this now -->
<script lang="ts">
  let count = $state(0);
  function onclick() {
    count++;
  }
</script>
<button onclick={onclick}>Clicks: {count}</button>
<!-- Note: when the attribute has the exact same name as the value, you can omit the name -->
<button {onclick}>Clicks: {count}</button> <!-- Same result -->
```

In Svelte 5, prefer passing callback props to components rather than event dispatchers.
```svelte
<!-- Svelte 5 -->
<script lang="ts">
  let { 
    turnLeft,
    turnRight
  } = $props();
  let speed = $state(0);
</script>
<button onclick={() => speed++}>+</button>
<button onclick={() => speed--}>-</button>
<p>Speed: {speed}</p>
<button onclick={() => turnLeft(speed)}>Turn Left</button>
<button onclick={() => turnRight(speed)}>Turn Right</button>
```

## Important Notes for Agents

1. **Always use explicit runes** - `let` declarations are no longer implicitly reactive
2. **Props are destructured** - Use `$props()` and destructuring syntax
3. **No more stores for simple state** - Use `$state()` instead of writable stores for component state
4. **Events are attributes** - Use `onclick` instead of `on:click` for DOM events
5. **Snippets replace slots** - Use `{#snippet}` blocks instead of `<slot>` elements

## Resources

- [Svelte 5 Documentation](https://svelte.dev/docs/svelte)
- [Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)

Remember: Svelte 5 is backward compatible - old Svelte 4 syntax still works, but new code should use the runes API for better performance and maintainability.
