<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        tip: string | Snippet;
        children: Snippet;
    }
    let {
        tip,
        children
    }: Props = $props();

    let showTimer: number | undefined = $state();
    let hideTimer: number | undefined = $state();
    let show = $state(false);

    function enter() {
        clearTimeout(hideTimer);
        if (!show) {
            showTimer = setTimeout(() => show = true, 300);
        }
    }
    function leave() {
        clearTimeout(showTimer);
        if (show) {
            hideTimer = setTimeout(() => show = false, 500);
        }
    }
</script>

{#if !tip}
    {@render children()}
{:else}
    <span
        class="tooltip-wrapper"
        role="presentation"
        onmouseenter={enter}
        onmouseleave={leave}
    >
        {@render children()}

        {#if show}
            <div class="tooltip-container">
                {#if typeof tip === 'string'}
                    <span>{tip}</span>
                {:else}
                    {@render tip()}
                {/if}
            </div>
        {/if}
    </span>
{/if}

<style>
    .tooltip-wrapper {
        display: contents;
        position: relative;
    }

    .tooltip-container {
        display: flex;
		display: inline-block;
		z-index: 1000;
		position: fixed;
		flex-direction: column;
		justify-content: center;
		width: fit-content;
		padding: 4px 8px;
		border: 1px solid red;
		border-radius: 15px;
		background-color: grey;
		text-align: left;
		white-space: pre-line;
		word-break: break-word;
		/* pointer-events: none; */
    }
</style>