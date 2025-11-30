# Guidelines for writing documentation

Efficient communication is like an easy, filling meal. Maximum (useful) information, minimum effort to parse and understand. The more efficiently you write, the more happy and productive everyone who reads your writing will be.

Principles of efficient communication:
1. Communicate **facts** and avoid evaluations. Opinions are not evaluations, and are fine if they're useful. Trust the reader to make their own judgment.
2. Trim down to maximize insight. First-order thinking is cheap and easily inferred/rediscovered, and is thus the least valuable. Again, respect the reader's intelligence.
3. Plans dictate **direction** - where to steer. Keep it high level. Implementation details like code blocks rot easily and waste the reader's time.
4. Conversely, documentation describes **state** - how things are. When code changes, documentation must change with it - otherwise, you are wasting the reader's time.
5. Marketing words and bullshit-speak do not belong. Write a technical spec, not a sales pitch.

## Style Guidelines

Avoid repeated "verb the noun" phrasing.

### Plans
Once again, plans describe direction - where the project is going, what needs to be achieved.

Examples of bad/useless items:
- Improve abc [completely non-actionable]
- Take into account xyz [where xyz is some obvious thing]
- Develop X dialog [this is fine!]
- Integrate Y button with X dialog [not fine if obvious as part of X dialog]
- Preserve prior functionality [should be obvious why this is useless]
- Edge case handling validation [no details given]
- Handle cases where X is unavailable [style - prefer just "X may be unavailable"]

### Changelogs

Changelogs should describe what the user can do in the new version that they couldn't do before.

Bad:
- Fixed an issue causing breakage in glorble component that led to the bibdie manager being unable to foobar
- Added UI infrastructure with new dialog that allows the user to wibble the doohickey
- Adjusted internal handling of buffering requests, resulting in slightly improved latencies in some cases
Good:
- Fixed being unable to foobar due to the glorble component
- Added ability to wibble the doohickey
- Slightly improved latency for requests in some cases
Even better:
- foobar works again
- You can now wibble the doohickey
- Some requests are now faster
