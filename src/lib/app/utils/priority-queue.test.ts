import { describe, expect, test } from "vitest";
import { PriorityQueue } from "./priority-queue";

type Item = { name: string; priority: number };

describe("PriorityQueue", () => {
    test("dequeues highest priority first and preserves insertion order for ties", () => {
        const queue = new PriorityQueue<Item>(item => item.priority);
        queue.enqueue({ name: "first low", priority: 0 });
        queue.enqueue({ name: "first high", priority: 2 });
        queue.enqueue({ name: "second high", priority: 2 });
        queue.enqueue({ name: "medium", priority: 1 });

        expect(Array.from({ length: 4 }, () => queue.dequeue()?.name)).toStrictEqual([
            "first high",
            "second high",
            "medium",
            "first low",
        ]);
    });

    test("can discard queued values with lower priority", () => {
        const queue = new PriorityQueue<Item>(item => item.priority);
        queue.enqueue({ name: "low", priority: 0 });
        queue.enqueue({ name: "equal", priority: 3 });
        queue.enqueue({ name: "critical", priority: 3 }, { discardLower: true });

        expect(queue.dequeue()?.name).toBe("equal");
        expect(queue.dequeue()?.name).toBe("critical");
        expect(queue.dequeue()).toBeUndefined();
    });
});
