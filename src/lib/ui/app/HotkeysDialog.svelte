<script lang="ts">
    import Dialog from "#lib/ui/common/Dialog.svelte";
    import Hotkey from "#lib/ui/common/Hotkey.svelte";
    import { COMMANDS } from "#lib/app/commands.js";
    import { HOTKEY_GROUPS, UI_COMMANDS, displayChords, keyLabel, keysLabel } from "#lib/ui/commands.js";

    type Props = {
        open: boolean;
    };

    let { open = $bindable() }: Props = $props();

    // Every command with keys, in its section. Commands that agents can run come first.
    const commands = [...Object.values(COMMANDS), ...Object.values(UI_COMMANDS)];
    const groups = HOTKEY_GROUPS.map(title => ({
        title,
        commands: commands.flatMap(({ group, keys, title: does }) => group === title && keys ? [{ does, ...displayChords(keys) }] : []),
    }));
</script>

<Dialog bind:open>
    {#snippet title()}
        <h3>Hotkeys</h3>
        <Hotkey>{keysLabel(UI_COMMANDS.toggleHotkeys)}</Hotkey>
    {/snippet}
    {#snippet body()}
        <!-- One grid for every section so the descriptions line up across them. -->
        <dl class="dialog-scroll hotkey-grid">
            {#each groups as group (group.title)}
                <dt class="group-title">{group.title}</dt>
                {#each group.commands as { does, chords, separator }}
                    <dt>
                        {#each chords as chord, i}
                            {#if i > 0}<span class="plus">{separator}</span>{/if}
                            {#each chord as key, j}
                                {#if j > 0}<span class="plus">+</span>{/if}
                                {#if key.startsWith("click ")}
                                    <span class="text-xs text-ink-2">{key}</span>
                                {:else}
                                    <Hotkey>{keyLabel(key)}</Hotkey>
                                {/if}
                            {/each}
                        {/each}
                    </dt>
                    <dd>{does}</dd>
                {/each}
            {/each}
        </dl>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .hotkey-grid {
        @apply grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 items-baseline;
        @apply flex-1;
    }
    .group-title {
        @apply col-span-2 mt-3 first:mt-0 text-xs font-semibold uppercase text-ink-2 select-none;
    }
    dt {
        @apply frow-1 items-center whitespace-nowrap;
    }
    .plus {
        @apply text-xs text-ink-3;
    }
    dd {
        @apply text-sm text-ink-1;
    }
</style>
