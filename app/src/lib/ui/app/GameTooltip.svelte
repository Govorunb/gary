<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";
    import VersionBadge from "./VersionBadge.svelte";

    type Props = {
        game: Game
    };

    let { game }: Props = $props();
</script>

<div class="card flex flex-col bg-primary-900 p-2 gap-1.5">
    <div class="row gap-1.5">
        <VersionBadge version={game.conn.version} />
        <p>ID: <b>{game.conn.id}</b></p>
        <button onclick={() => window.navigator.clipboard.writeText(game.conn.id)}>Copy</button>
    </div>
    <div class="row p-2 gap-1.5 items-start">
        <button class="bg-amber-900!" onclick={() => game.conn.disconnect()}>Disconnect</button>
    </div>
</div>
