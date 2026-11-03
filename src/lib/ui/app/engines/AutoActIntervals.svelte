<script lang="ts">
    import { getUserPrefs } from "#lib/app/utils/di.js";
    import { scrollNumInput } from "#lib/app/utils/index.js";
    import TeachingTooltip from "#lib/ui/common/TeachingTooltip.svelte";

    const userPrefs = getUserPrefs();

    // Seconds here, milliseconds in prefs.
    let actEvery = $derived(userPrefs.app.autoAct.tryInterval / 1000);
    let forceAfter = $derived(userPrefs.app.autoAct.forceInterval / 1000);

    function save() {
        const tryInterval = Math.round(actEvery * 1000);
        // Forcing can't come sooner than acting, so raise it instead of showing an error.
        const forceInterval = Math.max(Math.round(forceAfter * 1000), tryInterval);
        void userPrefs.setAutoActIntervals({ tryInterval, forceInterval });
        // Whatever didn't save (empty, zero) snaps back.
        actEvery = userPrefs.app.autoAct.tryInterval / 1000;
        forceAfter = userPrefs.app.autoAct.forceInterval / 1000;
    }
</script>

<div class="interval-fields">
    <div class="field-heading">
        <label class="field-label" for="act-every">Act every</label>
        <TeachingTooltip>
            <p>Gary asks the engine to act this often while it's idle. The engine may choose to wait. If nothing has been sent for the force interval, Gary forces an action.</p>
        </TeachingTooltip>
    </div>
    <span class="interval">
        <input id="act-every" class="field-input" type="number" min="1"
            bind:value={actEvery} onchange={save} {@attach scrollNumInput}
        />
        seconds
    </span>
    <label class="field-label" for="force-after">Force act after</label>
    <span class="interval">
        <input id="force-after" class="field-input" type="number" min="1"
            bind:value={forceAfter} onchange={save} {@attach scrollNumInput}
        />
        seconds
    </span>
</div>

<style lang="postcss">
    @reference "global.css";

    .interval-fields {
        @apply grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 items-center p-1;
    }

    .interval {
        @apply frow-2 items-center text-sm text-ink-1;
        & > input { @apply w-24; }
    }
</style>
