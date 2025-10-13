<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
</script>

<div class="header">
    <PowerButton />
    <h1>GCP (Gary Control Panel)</h1>
    <ThemePicker />
</div>
<GaryDashboard />

<style>
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-inline: 1rem;
        margin: 0;
        background-color: light-dark(rgb(from aqua r g b / 60%), rgb(from aqua r g b / 30%));
    }

    :root {
        font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
        font-size: 16px;
        line-height: 24px;
        font-weight: 400;

        color: light-dark(#0f0f0f, #f6f6f6);
        background-color: light-dark(#f6f6f6, #2f2f2f);

        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        -webkit-text-size-adjust: 100%;
    }

    .container {
        margin: 0;
        padding-top: 10vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        text-align: center;
        }

    .row {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 15px;
    }
</style>
