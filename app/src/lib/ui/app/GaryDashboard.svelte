<script lang="ts">
    import { injectAssert } from "$lib/app/utils/di";
    import { REGISTRY, type Registry } from "$lib/api/registry.svelte";
    import { SERVER_MANAGER, type ServerManager } from "$lib/app/server.svelte";
    import ConnectionsList from "./ConnectionsList.svelte";

    let manager = injectAssert<ServerManager>(SERVER_MANAGER);
    let registry = injectAssert<Registry>(REGISTRY);
</script>

<!-- 
Plan: Main view for context log, left/right sidebars for games/actions and advanced config respectively
-->
<div class="container">
    {#if manager.running}
        <div class="row">
            <p>Server is running on port {manager.port}</p>
        </div>
        <ConnectionsList />
    {:else}
        <p>Welcome to Gary.</p>
        <div class="row">
            <button onclick={() => manager.start()}>Start the server</button>
            <span style="padding-inline-start: 1ch;">to connect some games!</span>
        </div>
    {/if}
</div>

<style>
    .container {
        display: flex;
        padding: 1rem 1.75rem;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        gap: 1rem;
    }
</style>