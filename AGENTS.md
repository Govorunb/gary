# Project Summary

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/vedalai/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

## Agent Development Guidelines

For tasks that involve the whole codebase, you should break them up (by file/directory/etc) and delegate the chunks to subagents.
When you run a task in a subagent, start your prompt with "I am an agent [doing X task]. You are a subagent performing a subtask." so the subagent will know. If you see this in the prompt, it means you're the subagent and you're meant to directly do the task.

Always look for examples of how a component is used in the codebase before you write code that uses it.

IMPORTANT: Before you start your task:
- Refer to [`docs/ARCHITECTURE.md`](/docs/ARCHITECTURE.md) for a technical overview of the project's architecture
- Refer to [`docs/llm-ref/START.md`](/docs/llm-ref/START.md) for tips for common tasks
- Refer to [`docs/llm-ref/writing.md`](/docs/llm-ref/writing.md) when writing or reviewing plans, docs, or other kinds of prose content
