import { expect, test } from "vitest";
import * as v1 from "$lib/api/v1/spec";
import { SelfTestHarness } from "$lib/testing/self-test-harness";

test("not sharing harness state", async () => {
    const harness1 = new SelfTestHarness();
    const harness2 = new SelfTestHarness();
    const fq1 = harness1.session.scheduler.forceQueue;
    const fq2 = harness2.session.scheduler.forceQueue;
    const prefs1 = harness1.session.userPrefs;
    const prefs2 = harness2.session.userPrefs;

    const action1 = v1.zAction.decode({ name: "action1", schema: null });
    harness1.session.scheduler.forceQueue.push([action1]);

    expect([fq1.length, fq2.length]).toStrictEqual([1, 0]);
    
    const action2 = v1.zAction.decode({ name: "action2", schema: null });
    fq2.push([action2]);
    
    expect([fq1.length, fq2.length]).toStrictEqual([1, 1]);

    prefs1.api.server.port = 1;
    prefs2.api.server.port = 2;

    expect([prefs1.api.server.port, prefs2.api.server.port]).toStrictEqual([1,2]);
});
