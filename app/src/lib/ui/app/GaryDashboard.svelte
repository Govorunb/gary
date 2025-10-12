<script lang="ts">
    import ServerControls from "./ServerControls.svelte";

    let port: number = $state(parseInt(localStorage.getItem("ws-server:port") ?? "8000"));
</script>

<ServerControls bind:port={port} />