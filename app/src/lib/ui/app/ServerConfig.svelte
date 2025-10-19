<script lang="ts">
    import { webkitScrollNum } from "$lib/app/utils.svelte";
    import { getServerManager, getUserPrefs } from "$lib/app/utils/di";
    
    let manager = getServerManager();
    let userPrefs = getUserPrefs();
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
