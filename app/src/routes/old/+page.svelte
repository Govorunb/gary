<script lang="ts">
  import { Registry } from "$lib/api/registry.svelte";
  import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
  import { getContext, setContext } from "svelte";
  import ServerControls from "$lib/ui/app/ServerControls.svelte";

  let port: number = $state(parseInt(localStorage.getItem("ws-server:port") ?? "8000"));
  let registry: Registry = getContext("registry") ?? setContext("registry", new Registry());
  
</script>

<main class="container">
  <h3>Welcome to Gary</h3>
  <div class="row">
    <p>Theme: </p>
    <ThemePicker />
  </div>
  <div class="row">
    <ServerControls bind:port={port} />
  </div>
</main>

<style>

:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;

  color: light-dark(#0f0f0f, #f6f6f6);
  background-color: light-dark(#f6f6f6, #2f2f2f);

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

.container {
  margin: 0;
  padding-top: 10vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

.row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}

</style>
