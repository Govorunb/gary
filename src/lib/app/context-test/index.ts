import { tick } from "svelte";
import { ClientGame, type ActionResult } from "$lib/api/client-game";
import type { ConnectionClient } from "$lib/api/connection";
import { zContext, type Action } from "$lib/api/v1/spec";
import type { Session } from "$lib/app/session.svelte";
import { parseError } from "$lib/app/utils";

const RUNS = [
    { name: "fill_1000", count: 1_000, lines: 1 },
    { name: "fill_10000", count: 10_000, lines: 1 },
    { name: "fill_20000", count: 20_000, lines: 1 },
    { name: "fill_1000_long", count: 1_000, lines: 20 },
] as const;
const ACTIONS: Action[] = [{
    name: "measure",
    description: "Measure the current context without filling it first. Adds 10 warmup and 30 measured silent messages. Pause the engine first.",
}, ...RUNS.map(run => ({
    name: run.name,
    description: `Add ${run.count} silent ${run.lines}-line messages and report context performance before and after. Pause the engine first.`,
}))];
const WARMUP = 10;
const SAMPLES = 30;
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

type Sample = { processing: number; dom: number; frame: number };

function stats(label: string, samples: Sample[]) {
    const values = (key: keyof Sample) => samples.map(sample => sample[key]).sort((a, b) => a - b);
    return `${label} (median / p95 ms):\n` + (["processing", "dom", "frame"] as const).map(key => {
        const sorted = values(key);
        return `  ${key}: ${((sorted[14] + sorted[15]) / 2).toFixed(2)} / ${sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)}`;
    }).join("\n");
}

const TIMING_NOTES = "Timings are cumulative from send: processing includes message handling and any intervening UI work; dom waits for display publication and Svelte; frame waits for the next animation-frame callback, not completed paint. Internal connection; no WebSocket transport. Other game traffic, scrolling, and window visibility affect results.";

export class ContextTestGame extends ClientGame {
    private running = false;

    constructor(conn: ConnectionClient, private readonly session: Session) {
        super("Context Test", conn);
    }

    async lifecycle() {
        await this.hello();
        await this.sendContext("Context Test: pause the engine, then send a fill action or measure the current context. Each run adds silent messages to the existing context and reports performance before and after. Clear context first for a fresh run. Keep the window visible and use the same scroll position when comparing runs. Disconnect this game to stop a run.", true);
        await this.registerActions(ACTIONS);
        for await (const message of this.conn.listen()) await this.recvRaw(message);
        this.dispose();
    }

    async runAction(name: string): Promise<ActionResult> {
        const run = RUNS.find(run => run.name === name);
        if (!run && name !== "measure") return { success: false, message: `Unknown action '${name}'` };
        if (this.running) return { success: false, message: "A context test is already running." };
        if (!this.session.scheduler.muted) return { success: false, message: "Pause the engine before running the context test." };
        this.running = true;
        // Acknowledge before benchmarking so long runs do not time out as pending actions.
        setTimeout(() => {
            void (run ? this.profile(run.count, run.lines) : this.profileCurrent())
                .catch(error => this.sendContext(`Context Test failed: ${parseError(error).message}`, true))
                .finally(() => { this.running = false; });
        }, 0);
        return { success: true, message: `Starting ${name}. Results will appear in context.` };
    }

    override async sendContext(message: string, silent = true) {
        // ConnectionClient.send does not await receive; timings need the server handler to finish.
        await this.conn.conn.receive(zContext.decode({ game: this.name, data: { message, silent } }));
    }

    private async displayUpdated() {
        await Promise.all([this.session.context.whenDisplayed(), this.session.eventLog.whenDisplayed()]);
        await tick();
    }

    private retained() {
        return `${this.session.context.userView.length} displayed / ${this.session.context.actorView.length} actor events`;
    }

    private async measure(text: string) {
        const samples: Sample[] = [];
        for (let i = 0; i < WARMUP + SAMPLES; i++) {
            if (this.conn.conn.closed) return null;
            await nextFrame();
            const start = performance.now();
            await this.sendContext(`Sample ${i + 1}: ${text}`);
            const processing = performance.now() - start;
            await this.displayUpdated();
            const dom = performance.now() - start;
            await nextFrame();
            const frame = performance.now() - start;
            // Allow another frame before the next sample; rAF itself runs before paint.
            await nextFrame();
            if (i >= WARMUP) samples.push({ processing, dom, frame });
        }
        return samples;
    }

    private async profileCurrent() {
        await this.displayUpdated();
        const initial = this.retained();
        const samples = await this.measure("Line 1: synthetic context for long-running game testing.");
        if (!samples || this.conn.conn.closed) return;
        await this.sendContext([
            `Context Test measurement complete. ${import.meta.env.DEV ? "Development" : "Production"} build.`,
            `Before sampling: ${initial}. After sampling: ${this.retained()}.`,
            `${SAMPLES} samples after ${WARMUP} warmups; ${SAMPLES + WARMUP} short silent messages added, no fill.`,
            stats("Current context", samples),
            TIMING_NOTES,
        ].join("\n"));
    }

    private async profile(count: number, lines: number) {
        const text = Array.from({ length: lines }, (_, i) => `Line ${i + 1}: synthetic context for long-running game testing.`).join("\n");
        const started = performance.now();
        await this.displayUpdated();
        const initial = this.retained();
        const before = await this.measure(text);
        if (!before) return;
        const fillStart = performance.now();
        for (let i = 0; i < count; i++) {
            if (this.conn.conn.closed) return;
            await this.sendContext(`Fill ${i + 1}/${count}: ${text}`);
            // Keep the UI responsive while filling, including the disconnect control.
            if ((i + 1) % 10 === 0) { await tick(); await nextFrame(); }
        }
        await this.displayUpdated();
        await nextFrame();
        const fillMs = performance.now() - fillStart;
        const filled = this.retained();
        const after = await this.measure(text);
        if (!after || this.conn.conn.closed) return;
        await this.sendContext([
            `Context Test complete: ${count.toLocaleString()} fill messages, ${lines} line(s) each. ${import.meta.env.DEV ? "Development" : "Production"} build.`,
            `Before sampling: ${initial}. After filling: ${filled}. After sampling: ${this.retained()}.`,
            `${SAMPLES} samples per phase after ${WARMUP} warmups; sampling adds ${2 * (SAMPLES + WARMUP)} messages.`,
            stats("Before fill", before), stats("After fill", after),
            `Fill: ${fillMs.toFixed(0)} ms. Total: ${(performance.now() - started).toFixed(0)} ms.`,
            TIMING_NOTES,
        ].join("\n"));
    }
}
