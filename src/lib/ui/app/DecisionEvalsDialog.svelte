<script lang="ts">
    import { onDestroy } from "svelte";
    import { ChevronDown, Plus, X } from "@lucide/svelte";
    import { getSession } from "#lib/app/utils/di.js";
    import { captureProfile } from "#lib/app/evals/decision.js";
    import { currentDecision, decisionJson, distribution, lastDecision, parseDecision, runDecision, type DecisionDoc, type Trial } from "#lib/app/evals/runner.js";
    import { ENGINE_ID as RANDY_ID } from "#lib/app/engines/randy.svelte.js";
    import type { EventInstance } from "#lib/app/events/index.js";
    import dayjs from "dayjs";
    import Dialog from "#lib/ui/common/Dialog.svelte";
    import CodeMirror from "#lib/ui/common/CodeMirror.svelte";
    import CopyButton from "#lib/ui/common/CopyButton.svelte";
    import Popover from "#lib/ui/common/Popover.svelte";
    import TeachingTooltip from "#lib/ui/common/TeachingTooltip.svelte";

    let { open = $bindable(false), eventId }: { open?: boolean, eventId?: string } = $props();
    const session = getSession();
    const toJson = (doc: DecisionDoc) => decisionJson(doc, session.userPrefs.secrets);
    // svelte-ignore state_referenced_locally : where the dialog starts; capturing again replaces it
    let code = $state(toJson(lastDecision(session, eventId) ?? currentDecision(session)));
    let count = $state(3);
    let trials = $state<Trial[]>([]);
    let runDoc = $state.raw<DecisionDoc | null>(null);
    let running = $state(false);
    let error = $state("");
    let captureOpen = $state(false);
    let addOpen = $state(false);
    let controller: AbortController | undefined;
    // Closing the dialog stops the run.
    onDestroy(() => controller?.abort());

    const parsed = $derived(parseDecision(code));
    const profiles = $derived(parsed.isOk() ? parsed.value.engines : []);
    const decision = $derived(parsed.isOk() ? parsed.value.events.at(-1) as EventInstance<"app/scheduler/decision"> : null);
    const addable = $derived(Object.values(session.engines).filter(engine => !profiles.some(p => p.id === engine.id)));
    const planned = $derived(profiles.length * count);
    const canRun = $derived(parsed.isOk() && Number.isInteger(count) && count >= 1 && count <= 100);
    const groups = $derived(distribution(trials));

    function setEngines(engines: DecisionDoc["engines"]) {
        if (parsed.isOk()) code = toJson({ ...parsed.value, engines });
    }

    function capture(last: boolean) {
        captureOpen = false;
        const doc = last ? lastDecision(session) : currentDecision(session);
        if (!doc) return;
        // Keep the engines already picked for comparison.
        code = toJson(profiles.length ? { ...doc, engines: profiles } : doc);
    }

    async function run() {
        if (parsed.isErr()) return;
        runDoc = parsed.value;
        trials = [];
        error = "";
        controller = new AbortController();
        running = true;
        const result = await runDecision(runDoc, session.userPrefs, count, controller.signal, trial => trials.push(trial));
        if (result.isErr()) error = result.error;
        running = false;
    }

    function engineSummary(engineTrials: Trial[]) {
        const parts = [`${engineTrials.length} ${engineTrials.length === 1 ? "trial" : "trials"}`];
        const latency = engineTrials.reduce((sum, trial) => sum + trial.latencyMs, 0) / engineTrials.length;
        parts.push(latency < 1000 ? `${Math.round(latency)}ms avg` : `${(latency / 1000).toFixed(1)}s avg`);
        const tokens = engineTrials.reduce((sum, trial) => sum + (trial.tokens ?? 0), 0);
        if (tokens) parts.push(`${tokens.toLocaleString()} tokens`);
        const costs = engineTrials.filter(trial => trial.cost !== undefined);
        if (costs.length) parts.push(`$${costs.reduce((sum, trial) => sum + trial.cost!, 0).toFixed(6)}`);
        return parts.join(" · ");
    }
</script>

<Dialog bind:open class="eval-dialog">
    {#snippet title()}
        <h3>Decision evals</h3>
        <div class="header-actions">
            <TeachingTooltip>
                <p>Replays one decision without sending anything to games. Capture the last decision or the current state, edit the JSON, pick engines, and run.</p>
                <p>For an earlier decision, open the menu on the engine's message in the context and pick Evaluate this decision.</p>
                <p>API keys and server addresses always come from your configured engines. Copied JSON leaves them out.</p>
            </TeachingTooltip>
        </div>
    {/snippet}
    {#snippet body()}
        <div class="eval-grid">
            <section class="eval-column">
                <div class="eval-toolbar">
                    <span class="eval-label">
                        Decision
                        {#if decision}
                            <span class="decision-of">{decision.data.engine.name}, {dayjs(decision.timestamp).format("LTS")}{decision.data.force ? ", forced" : ""}</span>
                        {/if}
                    </span>
                    <Popover open={captureOpen} onOpenChange={d => captureOpen = d.open}>
                        {#snippet trigger(props)}
                            <button {...props} class="btn" disabled={running}>Capture <ChevronDown /></button>
                        {/snippet}
                        <button class="menu-item" onclick={() => capture(true)} disabled={!session.lastDecision}>Last decision</button>
                        <button class="menu-item" onclick={() => capture(false)}>Current state</button>
                    </Popover>
                    {#if parsed.isOk()}
                        <CopyButton data={toJson(parsed.value)} desc="decision JSON" />
                    {/if}
                </div>
                <CodeMirror {code} {open} onChange={value => code = value} />
                {#if parsed.isErr()}
                    <p class="callout err text-xs" role="alert">{parsed.error}</p>
                {/if}
            </section>
            <section class="eval-column">
                <div class="eval-toolbar">
                    <span class="eval-label">Engines</span>
                </div>
                <div class="engine-chips">
                    {#each profiles as profile (profile.id)}
                        <span class="engine-chip">
                            {profile.name}
                            <button class="icon-btn" aria-label="Remove {profile.name}"
                                disabled={running || profiles.length === 1}
                                onclick={() => setEngines(profiles.filter(p => p.id !== profile.id))}
                            >
                                <X />
                            </button>
                        </span>
                    {/each}
                    <Popover open={addOpen} onOpenChange={d => addOpen = d.open}>
                        {#snippet trigger(props)}
                            <button {...props} class="btn" disabled={running || parsed.isErr() || !addable.length}><Plus /> Add engine</button>
                        {/snippet}
                        {#each addable as engine (engine.id)}
                            <button class="menu-item" onclick={() => { addOpen = false; setEngines([...profiles, captureProfile(engine)]); }}>
                                {engine.name}
                            </button>
                        {/each}
                    </Popover>
                </div>
                <label class="trial-count">
                    Trials per engine
                    <input class="field-input" type="number" min="1" max="100" bind:value={count} disabled={running} />
                </label>

                <div class="eval-toolbar results-toolbar">
                    <span class="eval-label">Results</span>
                    {#if running}
                        <span class="note" aria-live="polite">{trials.length} of {runDoc!.engines.length * count}</span>
                    {/if}
                    {#if trials.length && !running}
                        <CopyButton data={JSON.stringify(trials, null, 2)} desc="results" />
                    {/if}
                </div>
                <div class="dialog-scroll results">
                    {#if error}
                        <p class="callout err text-xs" role="alert">{error}</p>
                    {/if}
                    {#if !runDoc}
                        <p class="note">Results appear here as trials finish.</p>
                    {:else}
                        {#each runDoc.engines as profile (profile.id)}
                            {@const engineTrials = trials.filter(trial => trial.engineId === profile.id)}
                            {#if engineTrials.length}
                                <div class="result-engine">
                                    <div class="result-engine-header">
                                        <span class="result-engine-name">{profile.name}</span>
                                        <span class="note">{engineSummary(engineTrials)}</span>
                                    </div>
                                    {#each groups.filter(group => group.engineId === profile.id).sort((a, b) => b.count - a.count) as group (group.kind + group.label)}
                                        {@const share = Math.round(group.count / engineTrials.length * 100)}
                                        <div class="result-row">
                                            <span class={["result-label", group.kind]} title={group.label}>{group.label}</span>
                                            <span class={["share-bar", group.kind]}><span style:width="{share}%"></span></span>
                                            <span class="result-share">{group.count} · {share}%</span>
                                        </div>
                                        {#if group.variants.length === 1}
                                            <span class="variant">{group.variants[0].data}</span>
                                        {:else if group.variants.length}
                                            <details class="variants">
                                                <summary>{group.variants.length} variants</summary>
                                                {#each group.variants as variant}
                                                    <span class="variant"><span class="note">{variant.count}×</span> {variant.data}</span>
                                                {/each}
                                            </details>
                                        {/if}
                                    {/each}
                                </div>
                            {/if}
                        {/each}
                    {/if}
                </div>
            </section>
        </div>
    {/snippet}
    {#snippet footer()}
        <span class="note">
            {#if profiles.some(profile => profile.id !== RANDY_ID)}
                LLM trials use your provider and may cost money.
            {/if}
        </span>
        <div class="frow-2">
            <button class="btn" onclick={() => open = false}>Close</button>
            {#if running}
                <button class="btn btn-danger" onclick={() => controller?.abort()}>Stop</button>
            {:else}
                <button class="btn btn-primary" onclick={run} disabled={!canRun}>
                    Run {planned} {planned === 1 ? "trial" : "trials"}
                </button>
            {/if}
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    :global(.eval-dialog) {
        @apply w-[64rem] max-w-[90vw] h-[75vh];
    }
    .eval-grid {
        @apply grid grid-cols-2 gap-5 flex-1 min-h-0;
    }
    .eval-column {
        @apply fcol-2 min-h-0 min-w-0;
    }
    .eval-toolbar {
        @apply frow-2 items-center h-8 shrink-0;
    }
    .eval-label {
        @apply flex-1 text-sm font-semibold text-ink-0;
    }
    .decision-of {
        @apply ml-1.5 text-xs font-normal text-ink-2;
    }
    .results-toolbar {
        @apply mt-2;
    }
    .engine-chips {
        @apply frow-2 flex-wrap items-center;
    }
    .engine-chip {
        @apply inline-flex items-center gap-1 h-8 pl-3 pr-0.5 rounded-md;
        @apply text-sm font-medium text-ink-1 bg-layer-3;
    }
    .trial-count {
        @apply frow-2 items-center text-sm text-ink-1;
        & > input { @apply w-20; }
    }
    .results {
        @apply fcol-4;
    }
    .result-engine {
        @apply fcol-1.5;
    }
    .result-engine-header {
        @apply frow-2 items-baseline;
    }
    .result-engine-name {
        @apply text-sm font-semibold text-ink-0;
    }
    .result-row {
        @apply grid grid-cols-[minmax(0,1fr)_6rem_5rem] gap-3 items-center;
    }
    .result-label {
        @apply truncate font-mono text-xs text-ink-0;
        &.skip, &.say { @apply font-sans text-sm text-ink-2; }
        &.error { @apply font-sans text-sm text-lvl-err whitespace-normal; }
    }
    .share-bar {
        @apply h-1.5 rounded-full bg-layer-3 overflow-hidden;
        & > span { @apply block h-full bg-accent; }
        &.error > span { @apply bg-lvl-err; }
    }
    .result-share {
        @apply text-right text-xs text-ink-2 tabular-nums;
    }
    .variants {
        @apply fcol-1 pl-3 -mt-1;
        & > summary { @apply text-xs text-ink-2 cursor-pointer select-none w-fit; }
        & > .variant { @apply pl-0 mt-0; }
    }
    .variant {
        @apply block pl-3 -mt-1 font-mono text-xs text-ink-1 break-all;
    }
</style>
