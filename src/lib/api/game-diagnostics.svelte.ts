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
                message: `(${this.game.name}) ${diagDef.message}`,
                details: diagDef.details,
                ctx: context ? { context } : undefined,
            });
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
            r.error(`Cannot suppress unknown diagnostic ${key}`);
            return;
        }
        if (!this.suppressions.includes(key)) {
            this.suppressions.push(key);
        }
        this.dismiss(key);
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
