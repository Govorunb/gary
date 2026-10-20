import { builtinEnvironments, type Environment } from "vitest/runtime";

// Run Svelte effects and reactivity without mounting any DOM.
export default {
    ...builtinEnvironments.node,
    name: "svelte-client",
    viteEnvironment: "client",
} satisfies Environment;
