<script lang="ts">
    import { injectAssert } from "$lib/app/utils/di";
    import { REGISTRY, type Registry } from "$lib/api/registry.svelte";
    import ContextLog from "./ContextLog.svelte";
    import GameTabs from "./GameTabs.svelte";
    import { GameWSConnection } from "$lib/api/ws";
    import { Game } from "$lib/api/registry.svelte";
    import { SESSION, type Session } from "$lib/app/session.svelte";
    import { Channel } from "@tauri-apps/api/core";
    import { v4 as uuid } from "uuid";

    let registry = injectAssert<Registry>(REGISTRY);
    let session = injectAssert<Session>(SESSION);

    function addDummyData() {
        const dummyConn = new GameWSConnection(`dummy-${uuid()}`, "v1", new Channel());
        const dummyGame = new Game(session, `Dummy Game ${registry.games.length + 1}`, dummyConn);
        dummyGame.actions.set("test_action", {
            name: "test_action",
            description: "This is a test action.",
            schema: {
                 type: "object",
                 properties: {
                     param1: { type: "string" },
                 },
             },
         });
         registry.games.push(dummyGame);
         session.context.system("System message.", {});
         session.context.client(dummyGame.name, "Client message.", {});
         session.context.user("User message.", {});
         session.context.actor("Actor message. This one's going to be really long to test line widths, line breaks, and so on.\n\r\n\n\r\rBet you didn't expect carriage returns, too!", false, {});
     }
</script>

<div class="dashboard-layout">
    <aside class="sidebar left-sidebar">
        <GameTabs />
    </aside>
    <main class="main-content">
        <ContextLog />
    </main>
    <aside class="sidebar right-sidebar">
        <h2>Settings</h2>
        <button onclick={addDummyData}>Add Dummy Data</button>
    </aside>
</div>

<style>
    .dashboard-layout {
        display: grid;
        grid-template-columns: 1fr 2fr 1fr;
        height: 100vh;
        width: 100%;
    }

    .sidebar {
        padding: 1rem;
        background-color: light-dark(#f4f4f4, #1a1a1a);
        color: light-dark(#000, #fff);
    }

    .main-content {
        padding: 1rem;
    }
</style>