<script lang="ts">
    import type { Snippet } from "svelte";
    import type { Session } from "#lib/app/session.svelte.js";
    import { provideSession } from "#lib/app/utils/di.js";

    let { session, children }: { session: Session; children: Snippet } = $props();

    // svelte-ignore state_referenced_locally : the parent keys this component by session
    provideSession(session);
</script>

{@render children()}
