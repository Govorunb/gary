import type { NoUndefined } from ".";

export class DefaultMap<K = any, V extends NoUndefined<any> = any> extends Map<K, V> {
    constructor(protected defaultFactory: () => V) {
        super();
    }

    get(key: K): V {
        let val = super.get(key);
        if (val === undefined) {
            this.set(key, val = this.defaultFactory());
        }
        return val;
    }
}
