import { toast, type ExternalToast, type ToastT } from "svelte-sonner";

export type BoundedToastId = string | number;

export type BoundedToastInput = {
    title: string;
    description?: string;
    identity?: string;
    priority?: number;
    durationMs?: number;
    now?: number;
};

export type BoundedToastRenderDecision = {
    action: "render";
    id: BoundedToastId;
    identity: string;
    title: string;
    description?: string;
    durationMs: number;
    count: number;
    dismissIds: BoundedToastId[];
};

export type BoundedToastSkipDecision = {
    action: "skip";
    identity: string;
    id?: BoundedToastId;
    reason: "throttled" | "evicted" | "noop";
    flushInMs?: number;
    dismissIds: BoundedToastId[];
};

export type BoundedToastDecision = BoundedToastRenderDecision | BoundedToastSkipDecision;

type TrackedToast = {
    id: BoundedToastId;
    identity: string;
    title: string;
    description?: string;
    priority: number;
    durationMs: number;
    count: number;
    lastRenderedCount: number;
    createdAt: number;
    updatedAt: number;
    nextRenderAt: number;
    expiresAt: number;
    pending: boolean;
    sequence: number;
};

export type BoundedToastLimiterOptions = {
    maxActive?: number;
    defaultDurationMs?: number;
    minUpdateIntervalMs?: number;
    idPrefix?: string;
};

export const BOUNDED_TOAST_DEFAULT_DURATION_MS = 10_000;
export const BOUNDED_TOAST_MAX_ACTIVE = 6;
const BOUNDED_TOAST_MIN_UPDATE_INTERVAL_MS = 1_000;

function hashString(input: string) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

export function makeToastIdentity(title: string, description?: string, kind: string = "toast") {
    return `${kind}:${hashString(JSON.stringify([title, description ?? ""]))}`;
}

function formatToastTitle(title: string, count: number) {
    return count > 1 ? `${title} (${count}x)` : title;
}

function formatToastDescription(description: string | undefined, count: number) {
    if (count <= 1) return description;

    const repeatText = `Repeated ${count} times.`;
    return description ? `${description}\n${repeatText}` : repeatText;
}

function normalizeDuration(durationMs: number | undefined, fallback: number) {
    if (durationMs === undefined) return fallback;
    if (durationMs === Number.POSITIVE_INFINITY) return durationMs;
    return Math.max(0, durationMs);
}

function expiresAt(now: number, durationMs: number) {
    return Number.isFinite(durationMs) ? now + durationMs : Number.POSITIVE_INFINITY;
}

export class BoundedToastLimiter {
    readonly maxActive: number;
    readonly defaultDurationMs: number;
    readonly minUpdateIntervalMs: number;
    readonly idPrefix: string;

    #nextSequence = 0;
    #byIdentity = new Map<string, TrackedToast>();
    #byId = new Map<BoundedToastId, TrackedToast>();

    constructor(options: BoundedToastLimiterOptions = {}) {
        this.maxActive = options.maxActive ?? BOUNDED_TOAST_MAX_ACTIVE;
        this.defaultDurationMs = options.defaultDurationMs ?? BOUNDED_TOAST_DEFAULT_DURATION_MS;
        this.minUpdateIntervalMs = options.minUpdateIntervalMs ?? BOUNDED_TOAST_MIN_UPDATE_INTERVAL_MS;
        this.idPrefix = options.idPrefix ?? "gary-toast";
    }

    get activeCount() {
        return this.#byIdentity.size;
    }

    has(identity: string) {
        return this.#byIdentity.has(identity);
    }

    record(input: BoundedToastInput): BoundedToastDecision {
        const now = input.now ?? Date.now();
        this.#prune(now);

        const identity = input.identity ?? makeToastIdentity(input.title, input.description);
        const durationMs = normalizeDuration(input.durationMs, this.defaultDurationMs);
        let entry = this.#byIdentity.get(identity);

        if (!entry) {
            entry = {
                id: `${this.idPrefix}:${identity}:${this.#nextSequence++}`,
                identity,
                title: input.title,
                description: input.description,
                priority: input.priority ?? 0,
                durationMs,
                count: 0,
                lastRenderedCount: 0,
                createdAt: now,
                updatedAt: now,
                nextRenderAt: now,
                expiresAt: expiresAt(now, durationMs),
                pending: false,
                sequence: this.#nextSequence,
            };
            this.#byIdentity.set(identity, entry);
            this.#byId.set(entry.id, entry);
        } else {
            entry.title = input.title;
            entry.description = input.description;
            entry.priority = input.priority ?? entry.priority;
            entry.durationMs = durationMs;
            entry.updatedAt = now;
            entry.expiresAt = expiresAt(now, durationMs);
        }

        entry.count += 1;

        const dismissIds = this.#enforceMaxActive();
        if (!this.#byIdentity.has(identity)) {
            return { action: "skip", identity, id: entry.id, reason: "evicted", dismissIds };
        }

        if (entry.lastRenderedCount > 0 && now < entry.nextRenderAt) {
            entry.pending = true;
            return {
                action: "skip",
                identity,
                id: entry.id,
                reason: "throttled",
                flushInMs: entry.nextRenderAt - now,
                dismissIds,
            };
        }

        return this.#render(entry, now, dismissIds);
    }

    flush(identity: string, now: number = Date.now()): BoundedToastDecision {
        this.#prune(now);
        const entry = this.#byIdentity.get(identity);
        if (!entry?.pending || entry.count === entry.lastRenderedCount) {
            return { action: "skip", identity, reason: "noop", dismissIds: [] };
        }
        if (now < entry.nextRenderAt) {
            return {
                action: "skip",
                identity,
                id: entry.id,
                reason: "throttled",
                flushInMs: entry.nextRenderAt - now,
                dismissIds: [],
            };
        }

        return this.#render(entry, now, []);
    }

    release(id: BoundedToastId) {
        const entry = this.#byId.get(id);
        if (!entry) return;
        this.#delete(entry);
    }

    reset() {
        this.#nextSequence = 0;
        this.#byIdentity.clear();
        this.#byId.clear();
    }

    #render(entry: TrackedToast, now: number, dismissIds: BoundedToastId[]): BoundedToastRenderDecision {
        entry.pending = false;
        entry.lastRenderedCount = entry.count;
        entry.nextRenderAt = now + this.minUpdateIntervalMs;
        entry.expiresAt = expiresAt(now, entry.durationMs);

        return {
            action: "render",
            id: entry.id,
            identity: entry.identity,
            title: formatToastTitle(entry.title, entry.count),
            description: formatToastDescription(entry.description, entry.count),
            durationMs: entry.durationMs,
            count: entry.count,
            dismissIds,
        };
    }

    #prune(now: number) {
        for (const entry of Array.from(this.#byIdentity.values())) {
            if (entry.expiresAt <= now) this.#delete(entry);
        }
    }

    #enforceMaxActive() {
        const dismissIds: BoundedToastId[] = [];
        while (this.#byIdentity.size > this.maxActive) {
            const victim = this.#evictionCandidate();
            if (!victim) break;
            this.#delete(victim);
            if (victim.lastRenderedCount > 0) dismissIds.push(victim.id);
        }
        return dismissIds;
    }

    #evictionCandidate() {
        let candidate: TrackedToast | undefined;
        for (const entry of this.#byIdentity.values()) {
            if (
                !candidate ||
                entry.priority < candidate.priority ||
                (entry.priority === candidate.priority && entry.updatedAt < candidate.updatedAt) ||
                (entry.priority === candidate.priority && entry.updatedAt === candidate.updatedAt && entry.sequence < candidate.sequence)
            ) {
                candidate = entry;
            }
        }
        return candidate;
    }

    #delete(entry: TrackedToast) {
        this.#byIdentity.delete(entry.identity);
        this.#byId.delete(entry.id);
    }
}

type BoundedToastKind = "message" | "info" | "success" | "warning" | "error";
export type BoundedToastOptions = ExternalToast & {
    identity?: string;
    priority?: number;
};

type StoredToastCall = {
    kind: BoundedToastKind;
    options: ExternalToast;
};

const appToastLimiter = new BoundedToastLimiter();
const pendingFlushes = new Map<string, ReturnType<typeof setTimeout>>();
const latestCalls = new Map<string, StoredToastCall>();

const toastMethods: Record<BoundedToastKind, (title: string, options?: ExternalToast) => BoundedToastId> = {
    message: (title, options) => toast.message(title, options),
    info: (title, options) => toast.info(title, options),
    success: (title, options) => toast.success(title, options),
    warning: (title, options) => toast.warning(title, options),
    error: (title, options) => toast.error(title, options),
};

function clearFlush(identity: string) {
    const timer = pendingFlushes.get(identity);
    if (!timer) return;
    clearTimeout(timer);
    pendingFlushes.delete(identity);
}

function releaseRenderedToast(identity: string, id: BoundedToastId) {
    appToastLimiter.release(id);
    latestCalls.delete(identity);
    clearFlush(identity);
}

function renderBoundedToast(kind: BoundedToastKind, decision: BoundedToastRenderDecision, baseOptions: ExternalToast) {
    clearFlush(decision.identity);
    for (const id of decision.dismissIds) {
        toast.dismiss(id);
    }

    const { onAutoClose, onDismiss, ...rest } = baseOptions;
    const options = {
        ...rest,
        id: decision.id,
        duration: decision.durationMs,
        description: decision.description ?? rest.description,
        onAutoClose: (t: ToastT) => {
            releaseRenderedToast(decision.identity, decision.id);
            onAutoClose?.(t);
        },
        onDismiss: (t: ToastT) => {
            releaseRenderedToast(decision.identity, decision.id);
            onDismiss?.(t);
        },
    } satisfies ExternalToast;

    toastMethods[kind](decision.title, options);
}

function scheduleFlush(identity: string, flushInMs: number | undefined) {
    if (flushInMs === undefined || pendingFlushes.has(identity)) return;

    pendingFlushes.set(identity, setTimeout(() => {
        pendingFlushes.delete(identity);
        const decision = appToastLimiter.flush(identity);
        if (decision.action === "render") {
            const call = latestCalls.get(identity);
            if (call) renderBoundedToast(call.kind, decision, call.options);
            return;
        }
        scheduleFlush(identity, decision.flushInMs);
    }, Math.max(0, flushInMs)));
}

function bounded(kind: BoundedToastKind, title: string, options: BoundedToastOptions = {}) {
    const {
        identity: explicitIdentity,
        priority,
        id,
        description,
        duration,
        ...rest
    } = options;
    const textDescription = typeof description === "string" ? description : undefined;
    const identity = explicitIdentity ?? (id === undefined ? makeToastIdentity(title, textDescription, kind) : String(id));
    const baseOptions = { ...rest, description } satisfies ExternalToast;
    const decision = appToastLimiter.record({
        title,
        description: textDescription,
        identity,
        priority,
        durationMs: duration,
    });

    if (decision.action === "render") {
        latestCalls.set(decision.identity, { kind, options: baseOptions });
        renderBoundedToast(kind, decision, baseOptions);
    } else if (decision.reason === "throttled") {
        latestCalls.set(decision.identity, { kind, options: baseOptions });
        scheduleFlush(decision.identity, decision.flushInMs);
    }

    return decision.id;
}

export const boundedToast = {
    message: (title: string, options?: BoundedToastOptions) => bounded("message", title, options),
    info: (title: string, options?: BoundedToastOptions) => bounded("info", title, options),
    success: (title: string, options?: BoundedToastOptions) => bounded("success", title, options),
    warning: (title: string, options?: BoundedToastOptions) => bounded("warning", title, options),
    error: (title: string, options?: BoundedToastOptions) => bounded("error", title, options),
    reset: () => {
        for (const identity of pendingFlushes.keys()) clearFlush(identity);
        latestCalls.clear();
        appToastLimiter.reset();
    },
};
