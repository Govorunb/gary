<script lang="ts">
    import { zRandyPrefs, ENGINE_ID } from '$lib/app/engines/randy.svelte';
    import { NumberField, StringField } from '$lib/ui/common/form';
    import type { ConfigProps } from './EngineConfig.svelte';
    import EngineConfig from './EngineConfig.svelte';
    import { getSession, getUIState } from '$lib/app/utils/di';
    import OutLink from '$lib/ui/common/OutLink.svelte';

    let { engineId, close: close_ }: ConfigProps<typeof ENGINE_ID> = $props();
    const schema = zRandyPrefs;
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
        <NumberField
            bind:value={dirtyConfig.chanceDoNothing}
            label="Chance to Do Nothing"
            min={0} max={1} step={0.01}
            slider
            description="Probability (0-1) of skipping an action. Keep this above 0 or Randy might get stuck in a retry loop for some actions."
        />
        <NumberField
            bind:value={dirtyConfig.latencyMs}
            min={1} max={864000000}
            label="L*tency"
            description="Optional delay for Randy's responses (in milliseconds). If you set this too low and Randy gets stuck in a retry loop, your app will hang. You have been sufficiently informed and thus warned."
        />
        {#if uiState.aprilFools}
            <div class="callout warn">
                <span class="text-base font-semibold">
                    WARNING:
                </span>
                <span class="text-sm">
                    Your <span class="text-base"><i>Gary Gold Membership™</i></span> has <b>expired</b> and your Randy API key has been <b>revoked</b>. Please re-enter your license key below.
                </span>
            </div>
            <StringField
                label="License key"
                placeholder="Enter your Gary Gold Membership™ key"
                value="sk-rnd-TWFkZSB5b3UgbG9vayA7KQ=="
                password
            >
            {#snippet description()}
                <p class="note">
                    Please check your key for correctness. If it looks wrong, or you believe there has been a mistake, please
                    <OutLink href="https://gary.govorunb.dev/support">
                        contact support
                    </OutLink>
                    .
                </p>
            {/snippet}
            </StringField>
        {/if}
    {/snippet}
</EngineConfig>
