class Registry {
    private readonly games = new Map<string, Game>();
}

class Game {
    public readonly actions = new Map<string, Action>();
    // private readonly seenActions = new Set<string>();
    constructor(
        public readonly name: string,
        // private readonly registry: Registry,
    ) {

    }
}