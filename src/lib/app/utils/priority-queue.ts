export class PriorityQueue<T> {
    constructor(
        private readonly priorityOf: (value: T) => number,
        private readonly values: T[] = [],
    ) {}

    get length() {
        return this.values.length;
    }

    peek(): T | undefined {
        return this.values[0];
    }

    enqueue(value: T, { discardLower = false }: { discardLower?: boolean } = {}) {
        const priority = this.priorityOf(value);
        if (discardLower) {
            for (let i = this.values.length - 1; i >= 0; i--) {
                if (this.priorityOf(this.values[i]) < priority) {
                    this.values.splice(i, 1);
                }
            }
        }

        const index = this.values.findIndex(queued => this.priorityOf(queued) < priority);
        this.values.splice(index === -1 ? this.values.length : index, 0, value);
    }

    dequeue(): T | undefined {
        return this.values.shift();
    }

    clear() {
        this.values.length = 0;
    }
}
