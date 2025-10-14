<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
</script>

<div class="header">
    <PowerButton />
    <h1>Gary Control Panel</h1> <!-- TODO: place engine controls here a-la LMStudio -->
    <ThemePicker />
</div>
<div class="main">
    <GaryDashboard />
</div>

<style>
    .header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        grid-column-gap: 5px;
        padding: 0 1rem;
        align-items: center;
        background-color: light-dark(rgb(from aqua r g b / 60%), rgb(from aqua r g b / 30%));
        min-height: 60px;

        /* since they're components, they have to be :global'd */
        :global(& > :first-child) {
            justify-self: start;
        }
        /* h1 is just a tag so it does not need :global */
        & > h1 {
            justify-self: center;
        }
        :global(& > :last-child) {
            justify-self: end;
        }
    }

    .main {
        display: flex;
        flex: 1;
    }
</style>
