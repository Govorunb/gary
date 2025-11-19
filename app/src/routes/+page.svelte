<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
    import { getSession } from "$lib/app/utils/di";
    import EnginePicker from "$lib/ui/app/EnginePicker.svelte";
    import { HandFist, Pointer } from "@lucide/svelte";

    const session = getSession();

    function poke(force: boolean) {
        session.scheduler.clearError(); // manual action from user, implicitly acknowledged error
        if (force) {
            session.scheduler.forceAct();
        } else {
            session.scheduler.tryAct();
        }
    }
</script>

<header>
    <div class="justify-self-start">
        <PowerButton />
    </div>
    <h1 class="page-title">
        <EnginePicker />
        {#if session.activeEngine}
            <button onclick={() => poke(false)} class="act-btn" title="Poke (Try act)">
                <Pointer />
            </button>
            <button onclick={() => poke(true)} class="act-btn" title="Force Act">
                <HandFist />
            </button>
        {/if}
    </h1>
    <div class="justify-self-end">
        <ThemePicker />
    </div>
</header>
<main>
    <GaryDashboard />
</main>

<style lang="postcss">
    @reference 'global.css';

    header {
        @apply grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-4 py-3;
        @apply bg-primary-200 dark:bg-primary-900;
        @apply text-neutral-900 dark:text-neutral-100;
    }
    main {
        @apply flex flex-1 overflow-hidden;
        @apply bg-surface-100 dark:bg-surface-900;
    }
    .page-title {
        @apply justify-self-center flex flex-row items-center gap-3;
    }

    .act-btn {
        @apply ml-2 px-2 py-1 rounded-xl;
        @apply bg-neutral-200 dark:bg-neutral-800;
        @apply border border-surface-100 dark:border-surface-900;
    }
</style>