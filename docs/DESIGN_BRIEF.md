# Gary 1.0 visual redesign brief

Draft 2. Written from a grilling session and six rounds of mockup reactions.
Mockup source: docs/mockups/dashboard.html (toggle data-theme, data-left,
data-right, data-open, data-state attributes on the html element).

## The one sentence

Gary is second-monitor content. The user is in the game. They tab back to Gary
only when something looks wrong, and the dashboard is judged on what it tells
them in the first two seconds, before any click.

Every layout decision gets tested against that sentence.

## The three questions

Ranked. The dashboard exists to answer these, in this order, at a glance.

1. What did it just do? (context log)
2. Why is it not doing anything? (engine state, actions list, errors)
3. Did something break under the hood? (event log, warnings and above)

Anything on screen that doesn't help answer one of these needs to justify its
pixels or get out of the way.

## What the redesign is not

- Not an onboarding rework. Discoverability is a known pain point and stays a
  known pain point. One exception below (the power button).
- Not chat-first. The chat input is a last resort and should look like one.
- Not a personality injection. Dry, deadpan, ironic in the margins only. The
  app does its job 95 percent of the pixels.
- Not Neuro-branded. No pink. The author is unaffiliated.
- Not agent UX. Monitoring-by-a-human is the frame. Agent-driven Gary is a
  post-1.0 direction and only informs the "monitoring view" bias.
- Not mobile-first. Narrow viewport support stays but doesn't drive layout.

## Validated intent (keep, do not "improve")

These were each questioned and each survived with a reason. Previous redesign
attempts failed because they moved these without knowing the reason.

| Element | Why it is the way it is |
|---|---|
| Three columns | Games+actions left, context log center, event log right. Each is a different history. Context = game to model. Event log = app to game and model. |
| Left column is wide and tall | A game with 20 actions fills it. Scanning action names is the second most common task. |
| Context log owns the center | It answers question 1. Never cap its height to "last N messages". |
| Context log row anatomy | Color for scanning, timestamp, game name as source, text. Denser rows were tried and lost nothing but also won nothing. Keep the anatomy, refine the rendering. |
| Event log is a separate pane | Debugging view. Default filter should be warnings and above so it becomes a "something went wrong" indicator when quiet. |
| Power button is loud | First thing a new user must touch. It is the one onboarding affordance the app has. Keep it round, green, and visible. |
| Auto-act is a visible button | Users have complained about clicking poke repeatedly while auto-act sat two buttons away. It must be seen, not found. |
| State shown by color | Paused, errored, auto-act active. Half-second readability when returning. |
| Manual send, engine config, diagnostics live behind a click | Wanted out of the way until wanted. |
| Manual is orthogonal to engine | You can pause any engine and send manually. Don't design modes that hide this. |
| Multiple schemas open at once | Unlikely but no reason to forbid it. |

## What actually changes

Ranked by the user's own priority: layout and adaptability, density with
breathing room (lean dense), placement of menus. Fonts, icons, motion last.

### 1. No status line

Tried and rejected. Everything a status strip would show was already on
screen or was a count, and counts are slop. The rule that came out of it:
no number appears unless the user can act on it differently when it changes.

### 2. Top bar

Three-part grid so the middle stays centered regardless of the sides. Left:
a round green power button and the server settings button sharing one pill,
same behavior as today (green while running, red while stopped, disabled
without a Tauri backend, confirm and shift-click rules unchanged), then the
server address in mono. Clicking the address copies it, the copy icon next
to it is a teaching cue only. Center: engine picker, pause or resume, act,
auto-act, unchanged in function. Right: settings gear.

Stopped-on-error state: the resume button turns red as today, and a notice
peeks out from under the top bar, centered, reading "Stopped: reason" with a
close button and nothing else. It sizes to the center column and wraps
rather than truncates. Overlapping the Context title bar is acceptable.

### 3. The context log, refined not redesigned

Row anatomy kept: timestamp, source name, color, text. Color moves to a
full-height left bar plus a faint row tint, no border. Consecutive rows from
the same source share one continuous bar and drop the repeated header, with
a one pixel separator between sources. Model rows carry latency and token
count, hidden until hover or the "show details" modifier. Search and a
source filter in the title bar; both narrow the view only, never what the
model sees. No entry count.

### 4. Games and actions column

Game tabs live in the column title bar with a status dot each, plus the
connect button. The "Games" label is hidden once any game is connected.
Actions are single-line rows, name only, no count. Click a row to expand
description and schema inline, no chevron, no indent, expanded state shown
by background. Any number can be expanded. Send and inspect icons appear on
hover and keyboard focus.

### 5. The event log as a warning light

Default filter: warnings and above. The filter button with its "All Warn+"
label moves into the column title bar next to the menu. Rows keep the level
icon, title, relative time, description, and the details chevron. Diagnostics
log at their own severity so a warning diagnostic lights the column.
Collapsed, the right rail lists one glyph per event under the same filter as
the log, in log order, filled while unseen and faded once seen. Hover shows
the title, click opens the log at that event. No cap, the rail scrolls.

### 5a. Collapse and narrow layout

Toggles stay as they are: a chevron on the seam at mid-height, shown on
hover. Left rail collapsed shows game initials with status dots and the
connect button. Below 1024px both sides are rails and open as overlay
drawers with a dimmed backdrop, as today.

### 6. Dialogs and popovers

Manual send stays a dialog. Engine config stays inside the picker dialog for
now; it has too many fields for a popover. Diagnostics stays a dialog.

### 7. Visual system

Drop Skeleton's Cerberus theme and own the tokens. Flat layout: no gaps or
cards between columns, one pixel seams owned by the center column. Current
accent hues stay (navy bar, sky accent, amber/sky/emerald/purple sources).
Light and dark designed together. One UI sans, one mono for schemas, data,
and the server address. Motion limited to state changes that carry
information.

### 8. Collapsible chat input

Collapsed by default to a link at the bottom right of the context column
showing its hotkey. Expanded, it is a single-row box: text on the left,
silent toggle, teaching tooltip, and send on the right inside the box. The
tooltip carries the keys (send, close, shift inverts silent). Multi-line
text grows the box upward with the controls anchored bottom right, capped
at about six lines then scrolling. Escape or sending collapses it.

### 9. Margins

Empty states, error copy, the power button, the about dialog. That's where
the deadpan lives. Nowhere else.

## Hotkeys

Not sacred, not a target. Keep every existing hotkey unless a layout change
makes one nonsensical, then change that one. The full list lives in a dialog
on F1 and Ctrl+/, and that list is the one place to keep current.

## Acceptance tests

The redesign is done when the current dashboard fails these and the new one
passes.

1. Tab-back test. Screenshot the dashboard mid-session. A user who did not
   watch the session answers the three questions from the screenshot alone.
2. Twenty-action test. A game with 20 actions, one expanded with a schema,
   fits in the left column without the list feeling crushed.
3. Two-game test. Two connected games, one selected. Which game each context
   row came from is obvious.
4. Error-while-away test. An engine error happened five minutes ago. The
   dashboard shows it without opening the event log.
5. Light mode test. Every screen in light mode looks designed, not inverted.
6. Nothing-lost test. Every action reachable today is reachable in the new
   layout with at most the same number of clicks.

## Open questions for the author

- App icon. Done. Inter Black capital G, white on the gmod blue tile, same
  corner radius as the gmod mark. The bar stays: without it the letter reads
  as a C at 16px. Source is src-tauri/icons/icon.svg, every other size comes
  from `pnpm tauri icon src-tauri/icons/icon.svg` (delete the Square*, ios
  and android outputs, tauri.conf.json doesn't reference them) and the favicon
  is a copy of the 128px output.
- Right column default: open.

## Process from here

1. Author tears apart this brief. Every "keep" and "change" gets a yes or no.
2. Two or three static mockups of the dashboard, as images. Reactions, not
   speculation, since the author said that is how they evaluate.
3. Pick a direction. Build the token system (colors, spacing, type) in one
   file with light and dark side by side.
4. Rebuild the dashboard against the acceptance tests.
5. Dialogs and secondary screens on the new tokens.
6. New screenshots, new hotkey map, README update.
