/** Bounded ingestion buffer; reactive snapshots are published once per display interval. */
export class DisplayHistory<T> {
    #buffer: T[] = [];
    #items: readonly T[] = $state.raw([]);
    #timer: ReturnType<typeof setTimeout> | undefined;
    #pending = Promise.resolve();
    #resolve: (() => void) | undefined;

    /**
     * Keeps at least the newest `limit` items. With `headroom`, up to that many more pile up before the oldest are
     * dropped in one go, so a DOM list sheds its top rows rarely instead of on every append.
     */
    constructor(private readonly limit: number, private readonly headroom = 0) {}

    get items() {
        return this.#items;
    }

    append(item: T) {
        this.#buffer.push(item);
        if (this.#buffer.length > this.limit + this.headroom) this.#buffer.splice(0, this.#buffer.length - this.limit);
        if (this.#timer !== undefined) return;
        this.#pending = new Promise(resolve => { this.#resolve = resolve; });
        this.#timer = setTimeout(() => {
            this.#items = this.current();
            this.#finish();
        }, 16);
    }

    /** The retained items, oldest first, without waiting for the next published snapshot. */
    current(): T[] {
        return [...this.#buffer];
    }

    /** Wait for pending events to reach the reactive snapshot, before awaiting Svelte's tick. */
    whenPublished() {
        return this.#pending;
    }

    clear() {
        this.#cancel();
        this.#buffer = [];
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
