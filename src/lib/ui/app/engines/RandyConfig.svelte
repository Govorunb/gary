<script lang="ts">
    import { zRandyPrefs, type ENGINE_ID } from '#lib/app/engines/randy.svelte.js';
    import Field from '#lib/ui/common/form/Field.svelte';
    import type { ConfigProps } from './EngineConfig.svelte';
    import EngineConfig from './EngineConfig.svelte';
    import { getSession, getUIState } from '#lib/app/utils/di.js';
    import OutLink from '#lib/ui/common/OutLink.svelte';
    import z from 'zod';

    let { engineId, close: close_ }: ConfigProps<typeof ENGINE_ID> = $props();
    const schema = zRandyPrefs;
    const fields = schema.shape;
    const zLicenseKey = z.string().password().field({ title: "License key", placeholder: "Enter your Gary Gold Membership™ key" });
    const uiState = getUIState();
    const session = getSession();

    function close() {
        if (uiState.aprilFools) {
            session.userPrefs.app.garyGoldMembershipEndsAfter = new Date().getFullYear();
        }
        close_();
    }
</script>

<EngineConfig {engineId} {schema} {close}>
    {#snippet configForm(dirtyConfig)}
        <Field schema={fields.chanceDoNothing} bind:value={dirtyConfig.chanceDoNothing} />
        <Field schema={fields.latencyMs} bind:value={dirtyConfig.latencyMs} />
        <Field schema={fields.seed} bind:value={dirtyConfig.seed} />
        <details class="details-box chaos-details">
            <summary>Chaos testing</summary>
            <Field schema={fields.chanceUnregisteredAction} bind:value={dirtyConfig.chanceUnregisteredAction} />
            <Field schema={fields.chanceInvalidData} bind:value={dirtyConfig.chanceInvalidData} />
        </details>
        {#if uiState.aprilFools}
            <div class="callout warn">
                <span class="text-base font-semibold">
                    WARNING:
                </span>
                <span class="text-sm">
                    Your <span class="text-base"><i>Gary Gold Membership™</i></span> has <b>expired</b> and your Randy API key has been <b>revoked</b>. Please re-enter your license key below.
                </span>
            </div>
            <Field schema={zLicenseKey} value="sk-rnd-TWFkZSB5b3UgbG9vayA7KQ==">
            {#snippet description()}
                <p class="note">
                    Please check your key for correctness. If it looks wrong, or you believe there has been a mistake, please
                    <OutLink href="https://gary.govorunb.dev/support">
                        contact support
                    </OutLink>
                    .
                </p>
            {/snippet}
            </Field>
        {/if}
    {/snippet}
</EngineConfig>

<style lang="postcss">
    @reference "global.css";

    .chaos-details {
        @apply fcol-4 mt-1;
    }
</style>
