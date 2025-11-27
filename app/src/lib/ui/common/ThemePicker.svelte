<script lang="ts">
    import { onMount } from "svelte";
    import RadioButtons from "./RadioButtons.svelte";
    import { Monitor, Sun, Moon } from "@lucide/svelte";
    import { getUserPrefs } from "$lib/app/utils/di";
    import { on } from "svelte/events";

    const themeIcons = [Monitor, Sun, Moon];
    const themeTips = ["System", "Light", "Dark"] as const;
    const themes = ["system", "light", "dark"] as const;
    const userPrefs = getUserPrefs();
    let selectedIndex = $state(themes.indexOf(userPrefs.app.theme));
    let selectedTheme = $derived(themes[selectedIndex]);

    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    $effect(() => {
        userPrefs.app.theme = selectedTheme;
        if (selectedTheme === "system") {
            setTheme(systemDark.matches ? "dark" : "light");
        } else {
            setTheme(selectedTheme);
        }
    });
    $effect(() => {
        selectedIndex = Math.max(0, themes.indexOf(userPrefs.app.theme));
    })
    onMount(() => on(systemDark, "change", systemThemeChanged));

    function systemThemeChanged(evt: MediaQueryListEvent) {
        if (selectedTheme !== "system") return;
        setTheme(evt.matches ? "dark" : "light");
    }
    function setTheme(theme: "dark" | "light") {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(theme);
    }
    function getItemLabelProps(_item: string, i: number) {
        return {
            title: themeTips[i],
        };
    }
</script>

<RadioButtons items={themes} groupName="theme"
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
        @apply flex items-center size-full gap-2;
    }
</style>
