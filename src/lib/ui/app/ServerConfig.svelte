<script lang="ts">
    import { getServerManager, getUserPrefs } from "$lib/app/utils/di";
    import { BooleanField, NumberField } from "../common/form";
    import Switch from "../common/Switch.svelte";

    let manager = getServerManager();
    let userPrefs = getUserPrefs();
</script>

<div class="server-config">
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

    <div class="compatibility-section">
        <p class="section-label">API compatibility</p>
        <div class="compatibility-row">
            <div class="compatibility-copy">
                <p id="v1-reregister-label" class="field-label">Send deprecated v1 re-register request</p>
                <p class="field-description">For integrations that still depend on actions/reregister_all after connecting.</p>
            </div>
            <Switch
                bind:checked={userPrefs.api.compatibility.sendV1ReregisterAll}
                aria-labelledby="v1-reregister-label"
            />
        </div>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .server-config {
        @apply fcol-3 min-w-80;
    }

    .compatibility-section {
        @apply fcol-2 pt-3;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }

    .section-label {
        @apply text-xs font-semibold uppercase;
        @apply text-neutral-500 dark:text-neutral-400;
    }

    .compatibility-row {
        @apply frow-3 items-start justify-between;
    }

    .compatibility-copy {
        @apply fcol-1;
    }

    .field-label {
        @apply text-sm font-medium select-none;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .field-description {
        @apply max-w-60 text-xs leading-4;
        @apply text-neutral-500 dark:text-neutral-400;
    }
</style>
