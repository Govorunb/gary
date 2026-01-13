# Event log

The [message](/src/lib/app/context.svelte.ts#L52-L93) architecture was fine enough at first, but it's now starting to get in the way of future features.  
For example, putting "Act (forced)"/"Gary wants attention" in the message header so we can leave the message text to be the actual content is actually kind of a pain.

It requires us to differentiate the "kind" of "actor message" (act/forced/say/notify):
- `customData` can store but it's completely untyped
- Can just match `string.startsWith` but that's mega scuffed

We also need to store and surface app messages that are relevant to the user but not to the LLM and vice versa.  
It was silly to think a unified context (where actor and user care about and see exactly the same things) was the right solution.

Also, trawling through raw text logs kind of sucks, to be perfectly honest. Structured logging should be the default in (current year).

## Outline

**Events** are fired when things happen. Each event kind has a unique **key** (e.g. `api/client/connected` - composed like a tree path) akin to diagnostics.

There should be a central **event stream** ("firehose") in the app, and consumers should be able to **subscribe** and filter for the event keys they're interested in. For example, the context log UI would filter for `api/client/*` (`connected`/`disconnected`/`context`/`renamed` etc), `user/ctx_msg`, `api/actor/*` (`act`/`force_act`/`skip_act`/`say`/`say_notify` etc), and so on.

Undecided on whether events should be declared centrally (like diagnostics) or vertically (owned by the relevant module).

Events with data should be typed (not sure how to reconcile this with easy declaration).

There would be a unified display (**event log**) to show events to the user. With it, we can finally let the user adjust logging verbosity and so on.

The [reporting](/src/lib/app/utils/reporting.ts) module would be co-opted into this. It'll only accept events (with a general `lazy_dev/uncategorized` event for arbitrary logs) and pipe them to the firehose.

Also, zod metadata for sensitive fields (blur).

## Issues/hurdles

### Figuring out a nice declarative architecture

As above - ideally declaring a new event shouldn't be a hassle.

Mock/direction/pseudocode declaration pattern:
```ts
/// src/lib/app/some_subsystem.ts

export const MY_EVENTS = [
    {
        key: 'app/subsys/doohickey',
        dataSchema: z.object({
            // ...
        }),
        // ...
    },
    {
        key: 'app/subsys/finagle',
        dataSchema: z.strictObject({
            // ...
        }),
        // ...
    }
] as const satisfies EventDef[];

/// events.ts (central declaration)
import { MY_EVENTS as SUBSYS_EVENTS } from '$lib/app/some_subsystem';

export const EVENTS = [
    ...SUBSYS_EVENTS,
    // ...
] as const satisfies EventDef[];
```

Usage:
```ts
const myEvents = firehose.filter(['app/subsys/doohickey', 'app/subsys/finagle']);
// inferred as EventStream<'app/subsys/doohickey' | 'app/subsys/finagle'>
// which will contain (typeof EVENTS)['app/subsys/doohickey' | 'app/subsys/finagle']
// i.e. (Event<SomeData> | Event<OtherData>)
```

### Reactivity 

Not sure if Svelte was made with pipelines in mind, afaik `$derived` arrays just recompute the whole thing:

```ts
const myState = $state([1,2,3,4,5]);
const even = $derived(myState.filter(i => i % 2 == 0));
myState.push(6);
// `even` is a new array
```

See [Svelte playground](https://svelte.dev/playground/hello-world?version=5.46.3#H4sIAAAAAAAAA42Ty27bMBBFf2VApIgMyI-4aRDID6CLrrPo0vKCFscyC4oixLFsw_W_l0PJjoMWRXbknTmXl6-zsLJCkYkHhY1uUYFsGnmCBou6cntCkYqtNuhFtjoLOjnuZSHoPfnduZFv0cTejfT4L72oLaGlYCPmvmi0o2VucwqyJ6hOP0kSwgIePA-S1VM6Tb-mz-m39WD23octWm7qoyY9Nwp5CJtEw2IJGr7AFBYLmAzu0dqoHx3NJrdCbXBk6jJhcTCD8RhW0xSe11y_uru93yUvg78YnufEZHoDU3hZd_pjntvHlMdwXTz96P-x523zCwsaaZ90jjFRJKjZ4__6b-4RYWIrjY8Ih56P38_bzpVuoTDS-0UuNmUu4i3M3U0jPFKvBt07aZdvLpxbv_FgxtJ9-fcntfZOm4_dkpOFNF0sTyeDsTTalHDuuB3qckcZPE0m7W7WaQetaNdJhyhdIsSxr5irvSZd2wy2-oiqBzc1UV1lMOnnTiqlbclW7shaVJX2zshTQA0e-04eDpUOP6JzLWqzr2xflEaXdqgJKx8q4YVj01euyzbhtWYwdUdQIcJdHi4MG6n0PqCvXQjeTjineBrh1_C2RMYP4LIOM6nNQVslsnjBlz_fzwqTvAMAAA).

We'll likely need to either pull in Rx (bundle size...) or frankenvibe our own. (or do some weird custom reactive collection thing with Svelte stores)
