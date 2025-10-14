<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
</script>

<div class="header">
    <div class="buttons">
        <PowerButton />
        <ThemePicker />
    </div>
    <div class="overlap-text-center">
        <h1>GCP (Gary Control Panel)</h1>
    </div>
</div>
<div class="main">
    <GaryDashboard />
</div>

<style>
    .header {
        background-color: light-dark(rgb(from aqua r g b / 60%), rgb(from aqua r g b / 30%));
        min-height: 60px;
        position: relative;
        z-index: -1;
        
        /* all of this just to actually center the text... */
        & .overlap-text-center {
            position: absolute;
            z-index: 0;
            width: 100%;
            text-align: center;
        }
        & .buttons {
            position: absolute;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-inline: 1rem;
            margin: 0;
            z-index: 1;
            height: 100%;
            width: calc(100% - 2rem);
        }
    }

    .main {
        display: flex;
        flex: 1;
    }
</style>
