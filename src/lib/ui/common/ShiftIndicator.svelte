<script lang="ts">
	import { pressedKeys } from '$lib/app/utils/hotkeys.svelte';
	import Hotkey from './Hotkey.svelte';
	import Tooltip from './Tooltip.svelte';
	import { ArrowUp } from '@lucide/svelte';

	const shiftPressed = $derived(pressedKeys.has('Shift'));
</script>

<Tooltip interactive>
	{#snippet trigger(props)}
		<button
			{...props}
			class="shift-indicator"
			class:pressed={shiftPressed}
			aria-label="Shift indicator"
			type="button"
		>
			<ArrowUp size={20} />
		</button>
	{/snippet}
	<div class="tooltip-panel">
		<p>
			When this indicator is visible, holding <Hotkey>Shift</Hotkey> may show more options or change behavior.
		</p>
		<p class="note">Note: Some actions may have additional logic conditions.</p>
	</div>
</Tooltip>

<style lang="postcss">
	@reference 'global.css';

	.shift-indicator {
		@apply flex items-center justify-center rounded-md;
		@apply text-ink-3 transition-colors cursor-default;
		&:hover { @apply text-ink-2; }
		&.pressed { @apply text-src-actor; }
	}
</style>
