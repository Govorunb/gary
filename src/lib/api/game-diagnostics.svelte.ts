import r from "$lib/app/utils/reporting";
import { type GameDiagnostic, getDiagnosticById, DiagnosticSeverity, type DiagnosticId, SeverityToLogLevel } from "./diagnostics";
import type { Game } from "./game.svelte";


export class GameDiagnostics {
    public diagnostics: GameDiagnostic[] = $state([]);

    constructor(private readonly game: Game) { }

    public get status(): 'ok' | 'warn' | 'error' {
        let status: 'ok' | 'warn' = 'ok';
        for (const { id, dismissed } of this.diagnostics) {
            if (dismissed) continue;

            const diag = getDiagnosticById(id);
            if (!diag) continue;

            if (diag.severity >= DiagnosticSeverity.Error) {
                return 'error';
            } else if (diag.severity === DiagnosticSeverity.Warning) {
                status = 'warn';
            }
        }
        return status;
    }

    public trigger(id: DiagnosticId, context?: any, report: boolean = true): GameDiagnostic | null {
        const diagDef = getDiagnosticById(id);
        if (!diagDef) {
            r.error(`Unknown diagnostic ${id}`, { ctx: context });
            return null;
        }

        const suppressed = this.isSuppressed(id);
        const diag = $state<GameDiagnostic>({
            id,
            timestamp: Date.now(),
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

    public isSuppressed(id: DiagnosticId) {
        return this.suppressions.includes(id);
    }

    public suppress(id: DiagnosticId) {
        const diag = getDiagnosticById(id);
        if (!diag) {
            r.error(`Cannot suppress unknown diagnostic ${id}`);
            return;
        }
        if (!this.suppressions.includes(id)) {
            this.suppressions.push(id);
        }
        this.dismiss(id);
    }

    public dismiss(id: DiagnosticId) {
        this.diagnostics.forEach(d => d.id === id && (d.dismissed = true));
    }
    public restore(id: DiagnosticId) {
        this.diagnostics.forEach(d => d.id === id && (d.dismissed = false));
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
