## Contributing

Start by reading through [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

Then, if you haven't already, bookmark the [Tauri](https://tauri.app/start/) and [Svelte](https://svelte.dev/docs/svelte/overview) docs.

### Dev environment setup

Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/). You'll need:
- [System Dependencies](https://tauri.app/start/prerequisites/#system-dependencies)
- [Rust](https://tauri.app/start/prerequisites/#rust)
- [Node.js](https://tauri.app/start/prerequisites/#nodejs)

Skip the mobile targets.

<details><summary>Troubleshooting</summary>

If you get an error like this:
```
error[E0554]: `#![feature]` may not be used on the stable release channel
 --> src/lib.rs:1:1
  |
1 | #![feature(if_let_guard)]
  | ^^^^^^^^^^^^^^^^^^^^^^^^^

For more information about this error, try `rustc --explain E0554`.
error: could not compile `gary` (lib) due to 1 previous error
```

You need to install the `nightly` Rust toolchain:
```
rustup install nightly
```
</details>


You can run the project in the following ways:
1. Dev server + browser: `pnpm d` (alias for `pnpm vite dev`)
    - Recommended for development that doesn't need Tauri APIs (e.g. pure UI or app logic)
    - Tauri-dependent features (anything on the Rust side - e.g. WebSocket server) won't work
    - Your browser will have a separate set of preferences (they are stored in the browser's [local storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage))
2. Tauri in debug mode: `pnpm r` (alias for `pnpm tauri dev`)
    - Takes slightly longer to start up because of the Rust compile
    - Runs a `vite dev` server and opens it the Tauri webview (instead of your browser)
        - You can run `pnpm r` and also connect through your browser (like `pnpm d`), it's just slower to start up and leaves the Tauri window around
    - More or less accurate to the release build
3. Tauri release build: `pnpm tauri build`
    - Bona fide release build, with everything that entails (e.g. frontend assets are bundled and minified, WebView origin is `tauri://localhost` on Linux and `https://tauri.localhost` on Windows)
    - Takes a while (full release build and bundle)
    - Preferences are shared with debug builds (you might need to clear them every now and then, so don't get too attached)

### Commands

- **Run the project**: `pnpm d`/`pnpm r` - aliases for `pnpm vite dev` and `pnpm tauri dev`. See previous section
- **Run tests**: `pnpm t`/`pnpm tw` - aliases for `pnpm vitest run` (single run) and `pnpm vitest` (watch mode)
- **Run checks**: `pnpm bc`/`pnpm sc` - aliases for `pnpm biome check`/`pnpm svelte-check`.

Check [`package.json`](./package.json) for the full list.

### Dev hotkeys

- `Backspace`-`Delete`-`Shift`-`L` - clear preferences (same as "Reset app preferences" in settings)
- `Control`-`Shift`-`+`-`S` - trigger safe mode (yes, that's a plus key - use the numpad)
