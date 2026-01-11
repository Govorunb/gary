<script lang="ts">
    import { getServerManager, getUserPrefs } from "$lib/app/utils/di";
    import { NumberField } from "../common/form";

    let manager = getServerManager();
    let userPrefs = getUserPrefs();
</script>

<NumberField bind:value={userPrefs.api.server.port}
    disabled={manager.running}
    min={1024}
    max={65535}
    label="Port"
    placeholder="Port (default 8000)"
/>
