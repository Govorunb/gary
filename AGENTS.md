# Project Summary

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/vedalai/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

## Agent Development Guidelines

Write code like a human will maintain it:
- YAGNI. Five lines are better than fifty, and one line is better than five - to an extent. Optimize for maintainability.
- When invariants are upheld, it lets us not even have to consider error handling. The rest of the time, `neverthrow` makes error handling ergonomic.
- Prefer following existing patterns of usage.

When reviewing:
- Make every added or changed line fight for survival. Negative LOC diffs make the codebase happy; churn needs to justify itself.
- If you think you found an edge case, verify it. Assume the happy path by default; every deviation required to reproduce the issue counts against it.

When writing prose, write with intention for the specific target audience:
- Plans describe direction.
- Docs describe current state.
- Changelogs describe what the user can now do that they couldn't before.
- User-facing copy describes things in the app's terms and never leaks internals.

Do not add "open questions" sections to plans or specs; raise a genuinely blocking question directly instead.

Work with the big picture in mind. For more context on the repo:
- Refer to [`docs/ARCHITECTURE.md`](/docs/ARCHITECTURE.md) for a technical overview of the project's architecture
- Refer to [`docs/AGENT_REF.md`](/docs/AGENT_REF.md) for common frontend conventions
