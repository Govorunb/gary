<script lang="ts">
    import type { Game } from "$lib/api/game.svelte";
    import WorkspaceEventLog from "./WorkspaceEventLog.svelte";

    let { selectedGame }: { selectedGame: Game | null } = $props();
</script>

<div class="workspace">
    <WorkspaceEventLog {selectedGame} />
</div>

<style lang="postcss">
    @reference "global.css";

    .workspace {
        @apply h-full min-h-0;
    }
</style>
