# Schema Test Port Implementation Plan

## Overview

Port the Python schema test (`src/tests/schema_test.py`) to the Tauri application, replacing the existing "Add Dummy Data" button with a schema testing system that follows existing architectural patterns.

## Current Implementation

The existing Python schema test provides:
- 30+ test actions with various JSON schemas
- Action validation using `jsonschema`
- Dynamic schema updates and re-registration
- "Samsara" mode (re-register all actions when complete)
- Edge case testing including "mean test" actions

## Implementation Plan

### 1. Create Schema Test Connection

Rename `DummyWSConnection` to `InternalWSConnection` and extend it to be able to receive messages programmatically.

### 2. Port Schema Test Actions

Port all test actions from Python to TypeScript. The schemas should be kept as JSON schemas, **not** Zod schemas!

### 3. Create Schema Test Game Class

Create a new `ClientGame` base class that acts as the other side to our server-side `Game` class.
See `docs/ARCHITECTURE.md` for more information on the protocol. Otherwise, reference the previous Python implementation.

`ClientGame` should obey the v1 protocol and generally match an actual game integration:
- Register actions on connect (or upon receiving `ReregisterAll`)
- Implement `handle()` method to process WebSocket messages
- Send `ForceAction` on a timeout if no actions are received (e.g. 5 seconds)
- Validate incoming action data using `ajv` (new dependency)
- Manage remaining actions and unregister on success
It should be agnostic of its connection.

Then, extend `ClientGame` into `SchemaTestGame` and implement schema test-specific logic:
- Samsara mode (re-register all actions when complete)
- Custom handlers, e.g. schema updates for `schema_update` action
- Track disposal of server-side connection/game instance

### 4. Update Dashboard Component

Replace the "Add Dummy Data" button with a "Schema Test" button.

## Technical Implementation Details

### SchemaTestGame

`SchemaTestGame` will contain an `InternalWSConnection` member - note this is the **server-side** connection. Game messages will be sent through it, and when it is closed the schema test will dispose.

### Message Flow
1. User clicks "Schema Test", which creates a new `InternalWSConnection` and `SchemaTestGame`
2. `SchemaTestGame` "connects" and registers test actions
3. Actions appear in game tabs and can be executed by engines
4. Game validates incoming action data and sends `ActionResult`
5. Successful actions are unregistered
6. When all actions complete, cycle repeats (samsara mode)
7. When the connection is closed, the schema test is disposed

### Schema Validation
We will use `ajv` for schema validation, despite already having Zod:
- Not all JSON schemas are convertible to Zod
- User-defined schemas cannot be expressed in Zod

### Lifecycle Management
The schema test runs while game instance is alive, and is automatically disposed when the user disconnects the game.
This is in contrast with the Python implementation, which runs in a loop due to having to connect over the network.

## Files to Create/Modify

### New Files
1. `app/src/lib/app/schema-test/actions.ts` - Ported test actions
2. `app/src/lib/app/schema-test/index.ts` - Schema test game logic

### Modified Files
1. `app/src/lib/api/ws.ts` - Rename `DummyWSConnection` to `InternalWSConnection`
2. `app/src/lib/ui/app/GaryDashboard.svelte` - Replace dummy data button
3. `app/src/lib/api/registry.svelte.ts` - Add schema test factory method

## Implementation Targets

### Features Included
- All 30+ test actions from Python version
- Samsara mode (re-register all when complete)

### Features Excluded
- `focus` variable (register and test only specified actions) - not needed for MVP
- External WebSocket connection - uses an app-internal connection

## Future Considerations
- Configuration:
  - Targeted testing of specific actions (user-configurable)
  - Custom user-defined actions
- Statistics and reporting
- Real network connection (to test other backends)