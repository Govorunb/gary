To get the app ready for a full 1.0 release, we need to significantly improve context handling. Specifically:
1. [.] System prompt
    - [x] Prepend system prompt
    The system prompt should be placed at the beginning of the context. It's currently included in LLM calls, but it should just be visible to the user as a regular context message.
    - [x] Reset context
    Clearing context should "reset" it instead - keeping the system prompt as the first message; this applies to context trimming as well (read below)
    - [.] Editable system prompt
    Prefs (current `const SYSTEM_PROMPT` used when null); a user-facing editor would be nice as well.
2. [ ] JSON Context
    - [ ] JSON prompting
    Currently, messages are converted to a chat-like format (e.g. `Client: Something happened.`). Converting to JSON would allow us to include more data and more clearly delineate message boundaries.
    - [ ] Store raw LLM response
    LLM responses are done through structured output; however, we throw away the outer `command` and modify the response before including it in context. This may affect LLM response accuracy as messages with the `assistant` role may include text the LLM didn't naturally generate; not to mention we'd have to re-convert it back to a `command` anyway for better "prior example" performance. Easier to just store the raw response.
3. [ ] Context trimming
    - Sessions can be long, so context can grow very large. Context trimming is basically essential.
    - [ ] Priority trimming
    Message importance is unfortunately not part of the spec for the SDK, but we can make some educated adjustments as part of our implementation details. For example, action calls and results are likely to be much safer to drop than context coming from a client.
    - [ ] Token usage tracking/estimation
    We're calling remote APIs (and OpenRouter may route the user's request to virtually any model) so we may not know a precise token limit. This means we also can't have a tokenizer, so we'll have to rely on token usage statistics returned from successful LLM API responses (or estimate if we don't have any).
