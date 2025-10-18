<script lang="ts">
    import { webkitScrollNum } from "$lib/app/utils.svelte";
    import { type ServerManager, SERVER_MANAGER } from "$lib/app/server.svelte";
    import { REGISTRY, type Registry } from "$lib/api/registry.svelte";
    import { injectAssert } from "$lib/app/utils/di";
    import { USER_PREFS, type UserPrefs } from "$lib/app/prefs.svelte";

    let manager = injectAssert<ServerManager>(SERVER_MANAGER);
    let userPrefs = injectAssert<UserPrefs>(USER_PREFS);
</script>

<div class="flex items-center justify-center gap-4">
    <label for="port-input">Port</label>
    <input
        id="port-input"
        disabled={manager.running}
        type="number"
        max="65535"
        min="1024"
        {@attach webkitScrollNum}
        placeholder="Port (default 8000)"
        bind:value={userPrefs.serverPort}
    />
</div>
