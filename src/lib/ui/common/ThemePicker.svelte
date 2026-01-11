<script lang="ts">
    import { THEMES, type Theme } from "$lib/app/theme.svelte";
    import RadioButtons from "./RadioButtons.svelte";
    import { Monitor, Sun, Moon } from "@lucide/svelte";

    const themeIcons = [Monitor, Sun, Moon];
    const themeTips = ["System", "Light", "Dark"] as const;

    type Props = {
        currentTheme?: Theme;
    };
    let { currentTheme = $bindable("system") }: Props = $props();

    let selectedIndex = $derived(Math.max(0, THEMES.indexOf(currentTheme)));

    $effect(() => {
        currentTheme = THEMES[selectedIndex];
    })

    function getItemLabelProps(_item: string, i: number) {
        return {
            title: themeTips[i],
        };
    }
</script>

<RadioButtons items={THEMES} groupName="theme"
    bind:selectedIndex {getItemLabelProps}
>
    {#snippet renderItem(_, i)}
        {@const Icon = themeIcons[i]}
        <div class="radio-item">
            <Icon />
        </div>
    {/snippet}
</RadioButtons>

<style lang="postcss">
    @reference "global.css";

    .radio-item {
        @apply frow-2 items-center size-full;
    }
</style>
