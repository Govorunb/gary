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

<div class="grid w-full flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,_1fr)_minmax(0,_2fr)_minmax(0,_1fr)]">
    <aside class="flex flex-col gap-4 rounded-xl bg-white/80 p-4 shadow-sm ring-1 ring-neutral-200/70 backdrop-blur-sm dark:bg-neutral-900/70 dark:ring-neutral-700">
        <GameTabs />
    </aside>
    <main class="flex flex-col gap-4 rounded-xl bg-white/90 p-4 shadow-sm ring-1 ring-neutral-200/70 backdrop-blur-sm dark:bg-neutral-900/80 dark:ring-neutral-700">
        <ContextLog />
    </main>
    <aside class="flex flex-col gap-4 rounded-xl bg-white/80 p-4 shadow-sm ring-1 ring-neutral-200/70 backdrop-blur-sm dark:bg-neutral-900/70 dark:ring-neutral-700">
        <h2 class="text-lg font-semibold">Settings</h2>
        <button
            class="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900"
            onclick={addDummyData}
        >
            Add Dummy Data
        </button>
    </aside>
</div>