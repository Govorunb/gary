import { getContext, hasContext, setContext } from "svelte";

export function inject<T extends {}>(key: symbol): T | undefined {
    return getContext(key);
}
export function injectAssert<T extends {}>(key: symbol): T {
    if (!hasContext(key)) {
        throw new Error(`(DI) No value provided for key ${key.toString()}`);
    }
    return getContext(key);
}

export function provide<T extends {}>(key: symbol, value: T): T {
    return setContext(key, value);
}

/** Initializes DI for a key - gets existing or registers new from factory. */
export function init<T extends {}>(key: symbol, factory: () => T): T {
    return inject(key) ?? provide(key, factory());
}
