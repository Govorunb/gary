<script lang="ts">
    import { getRegistry, getSession } from "$lib/app/utils/di";
    import ContextLog from "./ContextLog.svelte";
    import GameTabs from "./GameTabs.svelte";
    import { GameWSConnection } from "$lib/api/ws";
    import { Channel } from "@tauri-apps/api/core";
    import {env} from "$env/dynamic/private";

    let registry = getRegistry();
    let session = getSession();

    let counter = $state(1);
    function addDummyData() {
        const i = counter++;
        const dummyConn = new GameWSConnection(`dummy-${i}`, "v1", new Channel());
        const dummyGame = registry.createGame(`Dummy Game ${i}`, dummyConn);
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
         session.context.system("System message.", {});
         session.context.client(dummyGame.name, "Client message.", {});
         session.context.user("User message.", {});
         session.context.actor("Actor message. This one's going to be really long to test line widths, line breaks, and so on.\n\r\n\n\r\rBet you didn't expect carriage returns, too!", false, {});
     }


    async function sendTestRequest() {
        const request = {
            // model: "openai/gpt-4o",
            messages: [
                { role: "user", content: "Test" },
            ],
        };
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify(request),
        });
        const data = await response.json();
        console.log(data);
    }
</script>

<div class="grid w-full flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,_1fr)_minmax(0,_2fr)_minmax(0,_1fr)]">
    <aside class="section">
        <GameTabs />
    </aside>
    <main class="section">
        <ContextLog />
    </main>
    <aside class="section">
        <h2 class="text-lg font-semibold">Settings</h2>
        <button
            class="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900"
            onclick={addDummyData}
        >
            Add Dummy Data
        </button>
        <button
            class="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900"
            onclick={sendTestRequest}
        >
            Send test OpenRouter request
        </button>
    </aside>
</div>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    .section {
        @apply flex flex-col gap-4 rounded-xl p-4
            bg-white/90 shadow-sm ring-1 ring-neutral-200/70
            dark:bg-neutral-900/80 dark:ring-neutral-700/50;
    }
</style>