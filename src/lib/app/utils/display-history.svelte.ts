/** Bounded ingestion buffer; reactive snapshots are published once per display interval. */
export class DisplayHistory<T> {
    #buffer: T[] = [];
    #oldest = 0;
    #items: readonly T[] = $state.raw([]);
    #timer: ReturnType<typeof setTimeout> | undefined;
    #pending = Promise.resolve();
    #resolve: (() => void) | undefined;

    constructor(private readonly limit: number) {}

    get items() {
        return this.#items;
    }

    append(item: T) {
        if (this.#buffer.length < this.limit) {
            this.#buffer.push(item);
        } else {
            this.#buffer[this.#oldest] = item;
            this.#oldest = (this.#oldest + 1) % this.limit;
        }
        if (this.#timer !== undefined) return;
        this.#pending = new Promise(resolve => { this.#resolve = resolve; });
        this.#timer = setTimeout(() => {
            this.#items = [...this.#buffer.slice(this.#oldest), ...this.#buffer.slice(0, this.#oldest)];
            this.#finish();
        }, 16);
    }

    /** Wait for pending events to reach the reactive snapshot, before awaiting Svelte's tick. */
    whenPublished() {
        return this.#pending;
    }

    clear() {
        this.#cancel();
        this.#buffer = [];
        this.#oldest = 0;
        this.#items = [];
    }

    dispose() {
        this.#cancel();
        this.#buffer = [];
    }

    #cancel() {
        clearTimeout(this.#timer);
        this.#finish();
    }

    #finish() {
        this.#timer = undefined;
        this.#resolve?.();
        this.#resolve = undefined;
    }
}
