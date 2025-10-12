<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
</script>

<div class="header">
    <button>Server</button>
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
</style>
