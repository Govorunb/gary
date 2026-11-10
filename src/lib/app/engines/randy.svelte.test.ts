// @vitest-environment svelte-client
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Action } from "#lib/api/v1/spec.js";
import type { UserPrefs } from "../prefs.svelte";
import type { Session } from "../session.svelte";
import { Randy, zRandyPrefs, type RandyPrefs } from "./randy.svelte";
import { validateActionData } from "./action-data";

const actions = [
    { name: "move", schema: { type: "integer" } },
    { name: "speak", schema: { type: "string" } },
] satisfies Action[];

const disposers: Array<() => void> = [];

function createRandy(options: RandyPrefs) {
    let randy!: Randy;
    disposers.push($effect.root(() => {
        randy = new Randy({ engines: { randy: options } } as UserPrefs);
    }));
    return randy;
}

async function generateSequence(randy: Randy) {
    const session = {
        uiState: { aprilFools: false },
        registry: { games: [{
            name: "Game", shortId: "game",
            actions: new Map<string, Action & { active: boolean }>([
                ...actions.map(action => [action.name, { ...action, active: true }] as const),
                ["old", { name: "old", active: false }],
            ]),
        }] },
    } as unknown as Session;
    const sequence = [];

    for (let i = 0; i < 12; i++) {
        const result = await randy.tryAct(session, actions);
        if (result.isErr()) throw result.error;
        sequence.push(result.value);
    }

    return sequence;
}

const TEST_SEED = 12345;

afterEach(() => {
    disposers.splice(0).forEach(dispose => dispose());
    vi.restoreAllMocks();
});

describe("Randy", () => {

    test("uses its seed for every random decision", async () => {
        const mathRandom = vi.spyOn(Math, "random").mockImplementation(() => {
            throw new Error("Randy used unseeded randomness");
        });
        const options = zRandyPrefs.decode({ chanceDoNothing: 0.4, latencyMs: 1, seed: TEST_SEED });

        const first = await generateSequence(createRandy(options));
        const second = await generateSequence(createRandy(options));

        expect(second).toEqual(first);
        expect(mathRandom).not.toHaveBeenCalled();
    });

    test("uses its seed for chaos decisions too", async () => {
        vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("unseeded randomness"); });
        const options = zRandyPrefs.decode({
            chanceDoNothing: 0, latencyMs: 1, seed: TEST_SEED,
            chanceUnregisteredAction: 0.5, chanceInvalidData: 0.5,
        });
        const first = await generateSequence(createRandy(options));
        expect(await generateSequence(createRandy(options))).toEqual(first);
        expect(first.some(act => typeof act === "object" && "name" in act && act.name === "old")).toBe(true);
        expect(first.some(act => typeof act === "object" && "name" in act && act.name !== "old")).toBe(true);
    });

    test("restarts its sequence when the seed changes", async () => {
        const options = $state(zRandyPrefs.decode({ chanceDoNothing: 0, latencyMs: 1, seed: TEST_SEED }));
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

describe("Randy invalid data", () => {
    test.each([
        { type: "object", properties: { count: { type: "integer" } }, required: ["count"] },
        { type: "integer" },
        { type: "string" },
        { type: "array", items: { type: "string" } },
    ])("finds schema-invalid valid JSON for $type", async schema => {
        const randy = createRandy(zRandyPrefs.decode({ latencyMs: 1, chanceInvalidData: 1, seed: TEST_SEED }));
        const result = await randy.forceAct({ uiState: { aprilFools: false } } as Session, [{ name: "test", schema }]);
        const data = JSON.parse(result._unsafeUnwrap().data!);
        expect(validateActionData(schema, data)._unsafeUnwrap()).toBe(false);
    });

    test("keeps data when the schema accepts everything or cannot be checked", async () => {
        const act = (chanceInvalidData: number, schema: object) => createRandy(zRandyPrefs.decode({ latencyMs: 1, chanceInvalidData, seed: TEST_SEED }))
            .forceAct({ uiState: { aprilFools: false } } as Session, [{ name: "test", schema }]);
        for (const schema of [{}, {
            $schema: "https://json-schema.org/draft/2020-12/schema", type: "object",
            properties: { count: { const: 5 } }, required: ["count"],
        }]) {
            expect(await act(1, schema)).toEqual(await act(0, schema));
        }
    });

    test("leaves parameterless actions alone", async () => {
        const result = await createRandy(zRandyPrefs.decode({ latencyMs: 1, chanceInvalidData: 1, seed: TEST_SEED }))
            .forceAct({ uiState: { aprilFools: false } } as Session, [{ name: "test" }]);
        expect(result._unsafeUnwrap()).toEqual({ name: "test", data: "null" });
    });
});
