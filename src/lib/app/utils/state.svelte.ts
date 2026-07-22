export function snapshotState<T>(state: T): T {
    return $state.snapshot(state) as T;
}
