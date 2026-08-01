import { afterEach, describe, expect, test, vi } from "vitest";
import type { Action } from "$lib/api/v1/spec";
import type { UserPrefs } from "../prefs.svelte";
import type { Session } from "../session.svelte";
import { Randy, type RandyPrefs } from "./randy.svelte";

const actions = [
    { name: "move", schema: { type: "integer" } },
    { name: "speak", schema: { type: "string" } },
] satisfies Action[];

function createRandy(options: RandyPrefs) {
    return new Randy({ engines: { randy: options } } as UserPrefs);
}

async function generateSequence(randy: Randy) {
    const session = { uiState: { aprilFools: false } } as Session;
    const sequence = [];

    for (let i = 0; i < 12; i++) {
        const result = await randy.tryAct(session, actions);
        if (result.isErr()) throw result.error;
        sequence.push(result.value);
    }

    return sequence;
}

const TEST_SEED = 12345;

describe("Randy", () => {
    afterEach(() => vi.restoreAllMocks());

    test("uses its seed for every random decision", async () => {
        const mathRandom = vi.spyOn(Math, "random").mockImplementation(() => {
            throw new Error("Randy used unseeded randomness");
        });
        const options = { chanceDoNothing: 0.4, latencyMs: 1, seed: TEST_SEED };

        const first = await generateSequence(createRandy(options));
        const second = await generateSequence(createRandy(options));

        expect(second).toEqual(first);
        expect(mathRandom).not.toHaveBeenCalled();
    });

    test("restarts its sequence when the seed changes", async () => {
        const options = $state({ chanceDoNothing: 0, latencyMs: 1, seed: TEST_SEED });
        const randy = createRandy(options);
        const session = { uiState: { aprilFools: false } } as Session;

        const first = await randy.forceAct(session, actions);
        options.seed = 54321;
        await randy.forceAct(session, actions);
        options.seed = TEST_SEED;
        const repeated = await randy.forceAct(session, actions);

        expect(repeated).toEqual(first);
    });
});
