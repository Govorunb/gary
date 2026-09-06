import type { Game } from "$lib/api/game.svelte";
import { eventLevel, type EventInstance, type EventKey } from "$lib/app/events";
import type { LogLevel } from "$lib/app/utils";

/** The event log's filter. Shared with the collapsed rail so both show the same events. */
export type EventLogFilter = {
    selectedOnly: boolean;
    minimumLevel: LogLevel;
};

export function matchesSelectedGame(event: EventInstance<EventKey>, game: Game | null): boolean {
    if (!game) return false;

    const data = event.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object") return false;

    const eventGame = data.game as { id?: unknown } | undefined;
    if (eventGame?.id === game.conn.id) return true;
    if (data.gameId === game.conn.id) return true;
    if (data.id === game.conn.id) return true;

    return false;
}

export function filterEvents(
    events: readonly EventInstance<EventKey>[],
    filter: EventLogFilter,
    selectedGame: Game | null,
): EventInstance<EventKey>[] {
    return events
        .filter((event) => eventLevel(event) >= filter.minimumLevel)
        .filter((event) => !filter.selectedOnly || matchesSelectedGame(event, selectedGame));
}
