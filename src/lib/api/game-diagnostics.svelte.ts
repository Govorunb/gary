import { EVENT_BUS } from "$lib/app/events/bus";
import type { EventDef } from "$lib/app/events";
import { shortId } from "$lib/app/utils";
import { toast } from "svelte-sonner";
import { type GameDiagnostic, DiagnosticSeverity, type DiagnosticKey, DIAGNOSTICS_BY_KEY } from "./diagnostics";
import type { Game } from "./game.svelte";

const bugToast = { description: "This is a bug in the app, not a diagnostic for your game." };

export class GameDiagnostics {
    public diagnostics: GameDiagnostic[] = $state([]);

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

    public trigger(key: DiagnosticKey, context?: any, report: boolean = true): GameDiagnostic | null {
        const diagDef = DIAGNOSTICS_BY_KEY[key];
        if (!diagDef) {
            EVENT_BUS.emit('app/diagnostics/unknown/trigger', { key, context });
            toast.error(`Failed to trigger diagnostic '${key}' - unknown diagnostic`, bugToast);
            return null;
        }

        const suppressed = this.isSuppressed(key);
        const diag = $state<GameDiagnostic>({
            id: shortId(),
            timestamp: Date.now(),
            key,
            context,
            dismissed: suppressed,
        });
        this.diagnostics.push(diag);

        EVENT_BUS.emit('app/diagnostics/triggered', { diag, severity: diagDef.severity, report, suppressed });

        if (report && !suppressed) {
            if (diagDef.severity >= DiagnosticSeverity.Error) {
                toast.error(`(${this.game.name}) ${diagDef.title}`);
            } else if (diagDef.severity === DiagnosticSeverity.Warning) {
                toast.warning(`(${this.game.name}) ${diagDef.title}`);
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
            EVENT_BUS.emit('app/diagnostics/unknown/suppress', { key });
            toast.error(`Cannot suppress unknown diagnostic ${key}`, bugToast);
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
            EVENT_BUS.emit('app/diagnostics/unknown/unsuppress', { key });
            toast.error(`Tried to unsuppress unknown diagnostic ${key}`, bugToast);
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
    key: {} as { key: DiagnosticKey; context?: any },
    inst: {} as { diag: GameDiagnostic; severity: DiagnosticSeverity; report: boolean; suppressed: boolean },
} as const;

export const EVENTS = [
    {
        key: 'app/diagnostics/triggered',
        dataSchema: EVENT_DATA.inst,
    },
    {
        key: 'app/diagnostics/dismissed',
        dataSchema: EVENT_DATA.inst,
    },
    {
        key: 'app/diagnostics/restored',
        dataSchema: EVENT_DATA.inst,
    },
    {
        key: 'app/diagnostics/suppressed',
        dataSchema: EVENT_DATA.key,
    },
    {
        key: 'app/diagnostics/unsuppressed',
        dataSchema: EVENT_DATA.key,
    },
    {
        key: 'app/diagnostics/unknown/trigger',
        dataSchema: EVENT_DATA.key,
    },
    {
        key: 'app/diagnostics/unknown/suppress',
        dataSchema: EVENT_DATA.key,
    },
    {
        key: 'app/diagnostics/unknown/unsuppress',
        dataSchema: EVENT_DATA.key,
    },
] as const satisfies EventDef<'app/diagnostics'>[];
