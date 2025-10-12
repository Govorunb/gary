<script lang="ts">
    import RadioButtons from "./RadioButtons.svelte";

    const themeSymbols = ["🖥️", "☀️", "🌙"];
    // const themeSymbols = ["System", "Light", "Dark"];
    const themeTooltips = ["System", "Light", "Dark"];
    const savedTheme = localStorage.getItem("theme");
    let selectedIndex = $state(Math.max(0, themeSymbols.indexOf(savedTheme!)));
    let selectedTheme = $derived(themeSymbols[selectedIndex]);
    // $inspect(selectedTheme);
    $effect(() => {
        localStorage.setItem("theme", selectedTheme);
    })
</script>


<RadioButtons items={themeSymbols}
    bind:selectedIndex={selectedIndex}
    class="pill" groupName="theme">
    {#snippet renderItem(emoji: string, i: number)}
        {@const tip = themeTooltips[i]}
        <!-- TODO: tooltip only on symbol (should be on the entire button) -->
        <div title="{tip}" class="radio-item">{emoji}</div>
    {/snippet}
</RadioButtons>
