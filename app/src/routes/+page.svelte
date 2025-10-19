<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
    import { injectAssert } from "$lib/app/utils/di";
    import { SESSION, type Session } from "$lib/app/session.svelte";

    const session = injectAssert<Session>(SESSION);
</script>

<header>
    <div class="justify-self-start">
        <PowerButton />
    </div>
    <h1 class="justify-self-center text-3xl font-semibold">
        {#if session.activeEngine}
            {session.activeEngine.name}
            <button onclick={() => session.scheduler.try_act()} class="act-btn">Poke</button>
            <button onclick={() => session.scheduler.force_act()} class="act-btn">Force Act</button>
        {:else}
        Gary Control Panel
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
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    header {
        @apply grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-4 py-3;
        @apply bg-primary-200 dark:bg-primary-900;
        @apply text-neutral-900 dark:text-neutral-100;
    }
    main {
        @apply flex flex-1 overflow-scroll;
    }
    .act-btn {
        @apply ml-2 px-2 py-1 rounded-xl
        bg-primary-200 dark:bg-primary-800
        border border-neutral-900 dark:border-neutral-100;
    }
</style>