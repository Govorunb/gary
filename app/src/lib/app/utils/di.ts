import { getContext, hasContext, setContext } from "svelte";

type DIKey = symbol | string;

export function inject<T extends {}>(key: DIKey): T | undefined {
    return getContext(key);
}
export function injectAssert<T extends {}>(key: DIKey): T {
    if (!hasContext(key)) {
        throw new Error(`(DI) No value provided for key ${key.toString()}`);
    }
    return getContext(key);
}

export function provide<T extends {}>(key: DIKey, value: T): T {
    return setContext(key, value);
}

/** Initializes DI for a key - gets existing or registers new from factory. */
export function init<T extends {}>(key: DIKey, factory: () => T): T {
    return inject(key) ?? provide(key, factory());
}
