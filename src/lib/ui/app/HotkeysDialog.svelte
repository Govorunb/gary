<script lang="ts">
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";

    type Props = {
        open: boolean;
    };

    let { open = $bindable() }: Props = $props();

    // Every hotkey the app has, grouped by where it applies. Keep in step with the registerAppHotkey and onKeys calls.
    const groups: { title: string; keys: [keys: string[], does: string][] }[] = [
        {
            title: "Anywhere",
            keys: [
                [["F1", "or", "Ctrl", "/"], "This list"],
                [["Ctrl", ","], "Settings"],
                [["Ctrl", "E"], "Engine picker"],
                [["Alt", "C"], "Add to context"],
                [["Shift"], "Hold to reveal second-layer options where the arrow indicator is shown"],
            ],
        },
        {
            title: "Top bar",
            keys: [
                [["Shift", 'click "Act"'], "Force act"],
                [["Shift", 'click "Busy"'], "Stop the current act"],
                [["Shift", "click power"], "Stop the server without confirming"],
            ],
        },
        {
            title: "Actions list",
            keys: [
                [["Ctrl", "click row"], "Send the action (opens manual send if it has a schema)"],
            ],
        },
        {
            title: "Add to context",
            keys: [
                [["Ctrl", "Enter"], "Send"],
                [["Esc"], "Close"],
                [["Shift"], "Hold to invert silent for one message"],
            ],
        },
        {
            title: "Engine picker",
            keys: [
                [["1", "to", "9"], "Quick-select engine by position"],
                [["Alt", "click engine"], "Open its config"],
                [["Alt", "A"], "Add an OpenAI-compatible engine"],
                [["Shift"], "Hold to reveal delete buttons"],
                [["Ctrl", "Enter"], "Save engine config"],
            ],
        },
        {
            title: "Manual send",
            keys: [
                [["Ctrl", "Enter"], "Send"],
                [["Alt", "R"], "Fill with random data"],
                [["Shift"], "Hold to send despite validation errors"],
            ],
        },
        {
            title: "Diagnostics",
            keys: [
                [["Shift", 'click "Dismiss all"'], "Delete all diagnostics instead of dismissing"],
            ],
        },
    ];
</script>

<Dialog bind:open>
    {#snippet title()}
        <h3>Hotkeys</h3>
        <Hotkey>F1</Hotkey>
    {/snippet}
    {#snippet body()}
        <!-- One grid for every section so the descriptions line up across them. -->
        <dl class="dialog-scroll hotkey-grid">
            {#each groups as group (group.title)}
                <dt class="group-title">{group.title}</dt>
                {#each group.keys as [keys, does]}
                    <dt>
                        {#each keys as key, i}
                            {#if key === "to" || key === "or"}
                                <span class="plus">{key}</span>
                            {:else}
                                {#if i > 0 && keys[i - 1] !== "to" && keys[i - 1] !== "or"}<span class="plus">+</span>{/if}
                                {#if key.startsWith("click ")}
                                    <span class="text-xs text-ink-2">{key}</span>
                                {:else}
                                    <Hotkey>{key}</Hotkey>
                                {/if}
                            {/if}
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
