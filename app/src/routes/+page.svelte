<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
</script>

<header class="grid grid-cols-[minmax(0,_1fr)_auto_minmax(0,_1fr)] items-center gap-1 px-4 py-3 text-neutral-900 dark:text-neutral-100">
    <div class="justify-self-start">
        <PowerButton />
    </div>
    <h1 class="justify-self-center text-lg font-semibold">Gary Control Panel</h1>
    <div class="justify-self-end">
        <ThemePicker />
    </div>
</header>
<main class="flex flex-1 overflow-hidden">
    <GaryDashboard />
</main>
