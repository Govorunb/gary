import r from "$lib/app/utils/reporting";
import { type GameDiagnostic, getDiagnosticById, DiagnosticSeverity, type DiagnosticId, SeverityToLogLevel } from "./diagnostics";
import type { Game } from "./game.svelte";


export class GameDiagnostics {
    public diagnostics: GameDiagnostic[] = $state([]);
    public status: 'ok' | 'warn' | 'error' = $derived(this.getStatus());

    constructor(private readonly game: Game) { }

    private getStatus(): 'ok' | 'warn' | 'error' {
        let status: 'ok' | 'warn' = 'ok';
        for (const { id, dismissed } of this.diagnostics) {
            if (dismissed) continue;

            const diag = getDiagnosticById(id);
            if (!diag) continue;

            if (diag.severity === DiagnosticSeverity.Error) {
                return 'error';
            } else if (diag.severity === DiagnosticSeverity.Warning) {
                status = 'warn';
            }
        }
        return status;
    }

    public trigger(id: DiagnosticId, context?: any, report: boolean = true) {
        const diag = getDiagnosticById(id);
        if (!diag) {
            r.error(`Unknown diagnostic ${id}`, { ctx: context });
            return;
        }

        this.diagnostics.push({
            id,
            timestamp: Date.now(),
            context,
        });

        // TODO: suppress (from prefs, per game name)
        if (!report) return;
        const logLevel = SeverityToLogLevel[diag.severity];
        r.report(logLevel, {
            message: `(${this.game.name}) ${diag.message}`,
            details: diag.details,
            ctx: context ? { context } : undefined,
        });
    }

    public dismissDiagnosticsById(id: DiagnosticId) {
        this.diagnostics.forEach(d => d.id === id && (d.dismissed = true));
    }

    public clear() {
        this.diagnostics.length = 0;
    }
}
