import type { EventDef, EventInstance, Keys, PresentDefs } from "#lib/app/events/index.js";
import { shortId, LogLevel, snapshotState } from "#lib/app/utils/index.js";
import z from "zod";
import { boundedToast } from "#lib/app/utils/bounded-toast.js";
import { type GameDiagnostic, DiagnosticSeverity, type DiagnosticKey, DIAGNOSTICS_BY_KEY, type DiagData } from "./diagnostics";
import type { Game } from "./game.svelte";

const bugToast = { description: "This is a bug in the app, not a diagnostic for your game." };

export class GameDiagnostics {
    public diagnostics: GameDiagnostic<DiagnosticKey>[] = $state([]);

    constructor(private readonly game: Game) { }

    private get bus() {
        return this.game.session.bus;
    }

    private get gameRef() {
        return { id: this.game.id, name: this.game.name };
    }

    public get status(): 'ok' | 'warn' | 'error' {
        let status: 'ok' | 'warn' = 'ok';
        for (const { key, dismissed } of this.diagnostics) {
            if (dismissed) continue;

            const diag = DIAGNOSTICS_BY_KEY[key];
            if (!diag) continue;

            if (diag.severity >= DiagnosticSeverity.Error) {
                return 'error';
            } else if (diag.severity === DiagnosticSeverity.Warning) {
                status = 'warn';
            }
        }
        return status;
    }

    public trigger<K extends DiagnosticKey>(key: K, context?: DiagData<K>, report: boolean = true): GameDiagnostic<K> | null {
        const diagDef = DIAGNOSTICS_BY_KEY[key];
        if (!diagDef) {
            this.bus.emit('app/diagnostics/unknown/trigger', { game: this.gameRef, key, context });
            return null;
        }

        const suppressed = this.isSuppressed(key);
        // events are immutable, so the event gets its own copy of anything the game still holds
        this.bus.emit('app/diagnostics/triggered', {
            game: this.gameRef,
            diag: snapshotState({ id: shortId(), timestamp: Date.now(), key, context, dismissed: suppressed }) as GameDiagnostic<K>,
            severity: diagDef.severity,
            report,
            suppressed,
        });

        if (report && !suppressed) {
            const title = `(${this.game.name}) ${diagDef.title}`;
            const identity = `diagnostic:${this.game.id}:${key}`;
            if (diagDef.severity >= DiagnosticSeverity.Error) {
                const priority = diagDef.severity >= DiagnosticSeverity.Fatal ? LogLevel.Fatal : LogLevel.Error;
                boundedToast.error(title, { identity, priority });
            } else if (diagDef.severity === DiagnosticSeverity.Warning) {
                boundedToast.warning(title, { identity, priority: LogLevel.Warning });
            }
        }
        if (diagDef.severity >= DiagnosticSeverity.Fatal) {
            // TODO: disconnect with error code
            // TODO: delay next connect afterwards (if the client is *really* misbehaving, instant reconnects are a bad idea)
            // this.game.conn.disconnect();
        }
        return this.diagnostics.at(-1) as GameDiagnostic<K>;
    }

    /** Applies this game's diagnostic events. Nothing else changes the list. */
    public apply(event: EventInstance<DiagnosticEventKey>) {
        switch (event.key) {
            case "app/diagnostics/triggered":
                this.diagnostics.push({ ...event.data.diag });
                break;
            case "app/diagnostics/dismissed":
            case "app/diagnostics/restored": {
                const { key } = event.data;
                const dismissed = event.key === "app/diagnostics/dismissed";
                for (const diag of this.diagnostics) {
                    if (key === undefined || diag.key === key) diag.dismissed = dismissed;
                }
                break;
            }
            case "app/diagnostics/cleared":
                this.diagnostics.length = 0;
                break;
        }
    }

    public get suppressions() {
        return this.game.gamePrefs.diagnostics.suppressions;
    }

    public isSuppressed(key: DiagnosticKey) {
        return this.suppressions.includes(key);
    }

    public suppress(key: DiagnosticKey) {
        const diag = DIAGNOSTICS_BY_KEY[key];
        if (!diag) {
            this.bus.emit('app/diagnostics/unknown/suppress', { game: this.gameRef, key });
            return;
        }
        if (!this.suppressions.includes(key)) {
            this.suppressions.push(key);
        }
        this.dismiss(key);
    }

    public unsuppress(key: DiagnosticKey) {
        const diag = DIAGNOSTICS_BY_KEY[key];
        if (!diag) {
            this.bus.emit('app/diagnostics/unknown/unsuppress', { game: this.gameRef, key });
            return;
        }
        const i = this.suppressions.indexOf(key);
        if (i >= 0) {
            this.suppressions.splice(i, 1);
        }
        this.restore(key);
    }

    public dismiss(key: DiagnosticKey) {
        this.bus.emit('app/diagnostics/dismissed', { game: this.gameRef, key });
    }
    public restore(key: DiagnosticKey) {
        this.bus.emit('app/diagnostics/restored', { game: this.gameRef, key });
    }

    public dismissAll() {
        this.bus.emit('app/diagnostics/dismissed', { game: this.gameRef });
    }

    public restoreAll() {
        this.bus.emit('app/diagnostics/restored', { game: this.gameRef });
    }

    public reset() {
        this.bus.emit('app/diagnostics/cleared', { game: this.gameRef });
    }
}

const zGame = z.strictObject({ game: z.strictObject({ id: z.string(), name: z.string() }) });
const zDiagnosticKey = z.custom<DiagnosticKey>(key => typeof key === "string" && Object.hasOwn(DIAGNOSTICS_BY_KEY, key));
const zDiagnostic = z.strictObject({
    id: z.string(),
    timestamp: z.number(),
    key: zDiagnosticKey,
    context: z.unknown(),
    dismissed: z.boolean().optional(),
}).transform(diag => diag as GameDiagnostic<DiagnosticKey>);
const zTriggered = zGame.extend({ diag: zDiagnostic, severity: z.enum(DiagnosticSeverity), report: z.boolean(), suppressed: z.boolean() });
/** Without a key, applies to all of the game's diagnostics. */
const zDismissal = zGame.extend({ key: zDiagnosticKey.optional() });

const EVENT_DATA = {
    game: {} as { game: { id: string; name: string } },
    key: {} as { key: DiagnosticKey },
} as const;

const SEVERITY_LEVEL: Record<DiagnosticSeverity, LogLevel> = {
    [DiagnosticSeverity.Info]: LogLevel.Info,
    [DiagnosticSeverity.Warning]: LogLevel.Warning,
    [DiagnosticSeverity.Error]: LogLevel.Error,
    [DiagnosticSeverity.Fatal]: LogLevel.Fatal,
};

export const DIAGNOSTIC_KEYS = [
    'app/diagnostics/triggered',
    'app/diagnostics/dismissed',
    'app/diagnostics/restored',
    'app/diagnostics/cleared',
] as const;
type DiagnosticEventKey = typeof DIAGNOSTIC_KEYS[number];

export const EVENTS = [
    {
        key: 'app/diagnostics/triggered',
        dataSchema: zTriggered,
        description: "Diagnostic triggered",
        // Level follows severity so the event log doubles as a warning light. Suppressed ones are muted.
        level: ({ severity, suppressed }: z.infer<typeof zTriggered>) => suppressed ? LogLevel.Info : SEVERITY_LEVEL[severity],
        silent: true, // triggerDiagnostic toasts with the game name and dedupes by identity
    },
    {
        key: 'app/diagnostics/dismissed',
        dataSchema: zDismissal,
        description: "Diagnostic dismissed",
        level: LogLevel.Debug,
    },
    {
        key: 'app/diagnostics/restored',
        dataSchema: zDismissal,
        description: "Diagnostic restored",
        level: LogLevel.Debug,
    },
    {
        key: 'app/diagnostics/cleared',
        dataSchema: zGame,
        description: "Diagnostics cleared",
        level: LogLevel.Debug,
    },
    {
        key: 'app/diagnostics/suppressed',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.key,
        description: "Diagnostic suppressed",
        level: LogLevel.Debug,
    },
    {
        key: 'app/diagnostics/unsuppressed',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.key,
        description: "Diagnostic unsuppressed",
        level: LogLevel.Debug,
    },
    {
        key: 'app/diagnostics/unknown/trigger',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.key & { context: any },
        level: LogLevel.Error,
    },
    {
        key: 'app/diagnostics/unknown/suppress',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.key,
        level: LogLevel.Error,
    },
    {
        key: 'app/diagnostics/unknown/unsuppress',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.key,
        level: LogLevel.Error,
    },
] as const satisfies EventDef<'app/diagnostics'>[];

function describeDiagnostic({ game, diag }: z.infer<typeof zTriggered>) {
    const ctx = diag.context as Record<string, unknown> | undefined;
    const action = ctx?.action ?? ctx?.action_name;
    return {
        title: DIAGNOSTICS_BY_KEY[diag.key].title,
        description: typeof action === "string" ? `${game.name} · ${action}` : game.name,
    };
}

export const DISPLAY = {
    "app/diagnostics/triggered": describeDiagnostic,
    "app/diagnostics/unknown/trigger": ({ key }) => ({
        title: `Failed to trigger diagnostic '${key}' - unknown diagnostic`,
        description: bugToast.description,
    }),
    "app/diagnostics/unknown/suppress": ({ key }) => ({
        title: `Cannot suppress unknown diagnostic ${key}`,
        description: bugToast.description,
    }),
    "app/diagnostics/unknown/unsuppress": ({ key }) => ({
        title: `Tried to unsuppress unknown diagnostic ${key}`,
        description: bugToast.description,
    }),
} as PresentDefs<Keys<typeof EVENTS>>;
