<script lang="ts">
    import { getServerManager, getUserPrefs } from "$lib/app/utils/di";
    import { BooleanField, NumberField } from "../common/form";

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

<BooleanField
    bind:value={userPrefs.api.server.bindAllInterfaces}
    disabled={manager.running}
    label="Bind all interfaces"
    description="Use 0.0.0.0 instead of 127.0.0.1"
/>
