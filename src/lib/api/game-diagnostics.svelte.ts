import { shortId } from "$lib/app/utils";
import r from "$lib/app/utils/reporting";
import { type GameDiagnostic, getDiagnosticDefinition, DiagnosticSeverity, type DiagnosticKey, SeverityToLogLevel } from "./diagnostics";
import type { Game } from "./game.svelte";


export class GameDiagnostics {
    public diagnostics: GameDiagnostic[] = $state([]);

    constructor(private readonly game: Game) { }

    public get status(): 'ok' | 'warn' | 'error' {
        let status: 'ok' | 'warn' = 'ok';
        for (const { key, dismissed } of this.diagnostics) {
            if (dismissed) continue;

            const diag = getDiagnosticDefinition(key);
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
        const diagDef = getDiagnosticDefinition(key);
        if (!diagDef) {
            r.error(`Unknown diagnostic ${key}`, { ctx: context });
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

        if (report && !suppressed) {
            const logLevel = SeverityToLogLevel[diagDef.severity];
            r.report(logLevel, {
                message: `(${this.game.name}) ${diagDef.title}`,
                details: diagDef.description,
                ctx: context ? { context } : undefined,
            });
        }
        if (diagDef.severity >= DiagnosticSeverity.Fatal) {
            // TODO: disconnect with error code
            // TODO: delay next connect afterwards (mitigate instant reconnects)
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
        const diag = getDiagnosticDefinition(key);
        if (!diag) {
            r.error(`Cannot suppress unknown diagnostic ${key}.`, {
                toast: {
                    description: "This is a bug in the app, not a diagnostic for your game."
                }
            });
            return;
        }
        if (!this.suppressions.includes(key)) {
            this.suppressions.push(key);
        }
        this.dismiss(key);
    }

    public unsuppress(key: DiagnosticKey) {
        const diag = getDiagnosticDefinition(key);
        if (!diag) {
            r.error(`Tried to unsuppress unknown diagnostic ${key}`, {
                toast: {
                    description: "This is a bug in the app, not a diagnostic for your game."
                }
            });
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
