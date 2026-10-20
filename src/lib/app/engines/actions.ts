import type { Action } from "#lib/api/v1/spec.js";

type ActionCandidate<TGame> = { game: TGame; action: Action };
export type EngineActionTarget<TGame> = ActionCandidate<TGame> & { engineAction: Action };

/** Resolve names against the whole catalog, including inactive actions. */
export function engineActionSet<TGame extends { name: string; shortId: string; actions: ReadonlyMap<string, Action> }>(
    games: TGame[],
    available?: ActionCandidate<TGame>[],
) {
    const candidates = games.flatMap(game => Array.from(game.actions.values(), action => ({ game, action })));
    const actionNameCounts = new Map<string, number>();
    for (const { action } of candidates) {
        actionNameCounts.set(action.name, (actionNameCounts.get(action.name) ?? 0) + 1);
    }

    const displayNames = new Array<string>(candidates.length);
    const usedNames = new Set<string>();

    for (let i = 0; i < candidates.length; i++) {
        const { action } = candidates[i];
        if (actionNameCounts.get(action.name) === 1) {
            displayNames[i] = action.name;
            usedNames.add(action.name);
        }
    }

    for (let i = 0; i < candidates.length; i++) {
        const { game, action } = candidates[i];
        if (displayNames[i]) {
            continue;
        }

        const baseName = `${action.name} (${game.name} ${game.shortId})`;
        let displayName = baseName;
        let duplicateSuffix = 2;
        while (usedNames.has(displayName)) {
            displayName = `${baseName} #${duplicateSuffix}`;
            duplicateSuffix++;
        }
        displayNames[i] = displayName;
        usedNames.add(displayName);
    }

    const actions: Action[] = [];
    const targetsByName = new Map<string, EngineActionTarget<TGame>>();
    for (const candidate of available ?? candidates) {
        const index = candidates.findIndex(({ game, action }) =>
            game === candidate.game && action.name === candidate.action.name
        );
        const displayName = displayNames[index];
        const engineAction = { ...candidate.action, name: displayName };
        actions.push(engineAction);
        targetsByName.set(displayName, { ...candidate, engineAction });
    }

    return { actions, targetsByName };
}
