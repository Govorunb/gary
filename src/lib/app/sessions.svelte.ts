import dayjs from "dayjs";
import type { Result } from "neverthrow";
import { Session } from "./session.svelte";
import { parseJson, sessionJson, zSessionFile } from "./session-file";

/** The live session, and the saved one being looked at instead, if any. */
export class Sessions {
    #record: Session | null = $state.raw(null);

    constructor(readonly live: Session) {
        live.onDispose(() => this.#show(null));
    }

    /** The session the dashboard shows. Games connect to, and the engine acts in, the live one regardless. */
    get viewed() {
        return this.#record ?? this.live;
    }

    showLive() {
        this.#show(null);
    }

    open(text: string, name: string): Result<void, string> {
        return parseJson(zSessionFile, text)
            .map(file => this.#show(new Session(name, this.live.userPrefs, { events: file.events }, this.live.uiState.dialogs)));
    }

    /** The viewed session as a file, with credentials scrubbed like every other export. */
    save() {
        const session = this.viewed;
        return {
            name: `gary-session-${dayjs().format("YYYY-MM-DD-HHmmss")}.json`,
            text: sessionJson(session.toFile(), session.userPrefs.secrets),
        };
    }

    #show(record: Session | null) {
        this.#record?.dispose();
        this.#record = record;
    }
}
