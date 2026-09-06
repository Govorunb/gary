<script lang="ts">
    import { getServerManager, getUserPrefs } from "$lib/app/utils/di";
    import { BooleanField, NumberField } from "../common/form";
    import Switch from "../common/Switch.svelte";
    import TeachingTooltip from "../common/TeachingTooltip.svelte";

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
        label="Allow connections from other devices"
        description="Lets integrations outside this computer connect to Gary. Use this computer's network address and port. Only enable this on networks you trust."
    />

    <div class="compatibility-section">
        <p class="section-label">API compatibility</p>
        <Switch
            class="compatibility-row"
            bind:checked={userPrefs.api.compatibility.sendV1ReregisterAll}
        >
            <span class="field-label">Send <code>actions/reregister_all</code></span>
            <TeachingTooltip>
                <p><code>actions/reregister_all</code> was a proposed message for syncing registered actions on reconnect.</p>
                <p class="whitespace-pre-line">Games should instead register their available actions proactively on connect.
                    Enable when testing older integrations that still expect the request.</p>
            </TeachingTooltip>
        </Switch>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .server-config {
        @apply fcol-3 w-96 max-w-[calc(100vw-2rem)] min-w-0;
    }

    .compatibility-section {
        @apply fcol-2 pt-3 border-t border-edge;
    }

    .section-label {
        @apply text-xs font-semibold uppercase text-ink-2;
    }

    :global(.compatibility-row) {
        :global([data-part="label"]) {
            @apply frow-1.5 items-center;
        }
    }
</style>
