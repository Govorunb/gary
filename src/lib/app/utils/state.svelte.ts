export function snapshotState<T>(state: T): T {
    return $state.snapshot(state) as T;
}

/** Runs `create` under its own effect root, so it can be called outside component init. Server builds have no effects and just call it. */
export function withEffectRoot<T>(create: () => T): [T, () => void] {
    let created: { value: T } | undefined;
    const dispose = $effect.root(() => { created = { value: create() }; });
    return [(created ?? { value: create() }).value, dispose];
}
