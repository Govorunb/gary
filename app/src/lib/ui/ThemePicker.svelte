<script lang="ts">
    import RadioButtons from "./RadioButtons.svelte";

    const themeSymbols = ["🖥️", "☀️", "🌑"];
    const savedTheme = localStorage.getItem("theme") ?? themeSymbols[0];
    let selectedIndex = $state(themeSymbols.indexOf(savedTheme));
    let selectedTheme = $derived(themeSymbols[selectedIndex]);
    // $inspect(selectedTheme);
    $effect(() => {
        localStorage.setItem("theme", selectedTheme);
    })
</script>

<RadioButtons items={themeSymbols}
    bind:selectedIndex={selectedIndex}
    pill groupName="theme" />
