<script lang="ts">
    import RadioButtons from "./RadioButtons.svelte";
    import { Monitor, Sun, Moon } from "@lucide/svelte";

    const themeIcons = [Monitor, Sun, Moon];
    const themes = ["System", "Light", "Dark"];
    const savedTheme = localStorage.getItem("theme");
    let selectedIndex = $state(Math.max(0, themes.indexOf(savedTheme!)));
    let selectedTheme = $derived(themes[selectedIndex]);
    // $inspect(selectedTheme);
    $effect(() => {
        localStorage.setItem("theme", selectedTheme);
        document.documentElement.classList.remove("system", "light", "dark");
        document.documentElement.classList.add(themes[selectedIndex].toLowerCase());
    })
</script>


<RadioButtons items={themes}
    bind:selectedIndex={selectedIndex}
    groupName="theme">
    {#snippet renderItem(_, i: number)}
        {@const theme = themes[i]}
        {@const Icon = themeIcons[i]}
        <!-- FIXME: tooltip only on symbol (should be on the entire button) -->
        <div title="{theme}" class="radio-item">
            <Icon />
        </div>
    {/snippet}
</RadioButtons>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";
    @reference "@skeletonlabs/skeleton/themes/cerberus";

    .radio-item {
        @apply flex items-center size-full gap-2;
    }
</style>

