import { EVENT_BUS } from "$lib/app/events/bus";
import type { EventDef, Keys, PresentDefs } from "$lib/app/events";
import { shortId, LogLevel } from "$lib/app/utils";
import { boundedToast } from "$lib/app/utils/bounded-toast";
import { type GameDiagnostic, DiagnosticSeverity, type DiagnosticKey, DIAGNOSTICS_BY_KEY, type DiagData } from "./diagnostics";
import type { Game } from "./game.svelte";

const bugToast = { description: "This is a bug in the app, not a diagnostic for your game." };

export class GameDiagnostics {
    public diagnostics: GameDiagnostic<DiagnosticKey>[] = $state([]);

    constructor(private readonly game: Game) { }

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
            EVENT_BUS.emit('app/diagnostics/unknown/trigger', { game: { id: this.game.id, name: this.game.name }, key, context });
            return null;
        }

        const suppressed = this.isSuppressed(key);
        const diag = $state<GameDiagnostic<K>>({
            id: shortId(),
            timestamp: Date.now(),
            key,
            context,
            dismissed: suppressed,
        } as GameDiagnostic<K>);
        this.diagnostics.push(diag);

        EVENT_BUS.emit('app/diagnostics/triggered', {
            game: { id: this.game.id, name: this.game.name },
            diag,
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
        return diag;
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
            EVENT_BUS.emit('app/diagnostics/unknown/suppress', { game: { id: this.game.id, name: this.game.name }, key });
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
            EVENT_BUS.emit('app/diagnostics/unknown/unsuppress', { game: { id: this.game.id, name: this.game.name }, key });
            return;
        }
        const i = this.suppressions.indexOf(key);
        if (i >= 0) {
            this.suppressions.splice(i, 1);
        }
        this.restore(key);
    }

    public dismiss(key: DiagnosticKey) {
        this.diagnostics.forEach(d => d.key === key && (d.dismissed = true));
    }
    public restore(key: DiagnosticKey) {
        this.diagnostics.forEach(d => d.key === key && (d.dismissed = false));
    }

    public dismissAll() {
        this.diagnostics.forEach(d => d.dismissed = true);
    }

    public restoreAll() {
        this.diagnostics.forEach(d => d.dismissed = false);
    }


    public reset() {
        this.diagnostics.length = 0;
    }
}

const EVENT_DATA = {
    game: {} as { game: { id: string; name: string } },
    key: {} as { key: DiagnosticKey },
    inst: {} as { diag: GameDiagnostic<DiagnosticKey>; severity: DiagnosticSeverity; report: boolean; suppressed: boolean },
} as const;

export const EVENTS = [
    {
        key: 'app/diagnostics/triggered',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.inst,
        description: "Diagnostic triggered",
        level: LogLevel.Info,
    },
    {
        key: 'app/diagnostics/dismissed',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.inst,
        description: "Diagnostic dismissed",
        level: LogLevel.Debug,
    },
    {
        key: 'app/diagnostics/restored',
        dataSchema: {} as typeof EVENT_DATA.game & typeof EVENT_DATA.inst,
        description: "Diagnostic restored",
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

export const DISPLAY = {
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
