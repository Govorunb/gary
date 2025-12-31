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

        const suppressed = this.isSuppressed(id);
        this.diagnostics.push({
            id,
            timestamp: Date.now(),
            context,
            dismissed: suppressed,
        });

        if (!report || suppressed) return;
        const logLevel = SeverityToLogLevel[diag.severity];
        r.report(logLevel, {
            message: `(${this.game.name}) ${diag.message}`,
            details: diag.details,
            ctx: context ? { context } : undefined,
        });
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
        this.dismissDiagnosticsById(id);
    }

    public dismissDiagnosticsById(id: DiagnosticId) {
        this.diagnostics.forEach(d => d.id === id && (d.dismissed = true));
    }

    public dismissAll() {
        this.diagnostics.forEach(d => d.dismissed = true);
    }

    public reset() {
        this.diagnostics.length = 0;
    }
}
