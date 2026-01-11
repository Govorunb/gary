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
	<div class="shift-indicator-content">
		<p>
			When this indicator is visible, holding <Hotkey>Shift</Hotkey> may show more options or change behavior.
		</p>
		<p class="note">Note: Some actions may have additional logic conditions.</p>
	</div>
</Tooltip>

<style lang="postcss">
	@reference 'global.css';

	.shift-indicator {
		@apply flex items-center justify-center;
		@apply rounded-md;
		@apply text-neutral-400 dark:text-neutral-600;
		@apply transition-colors;
		@apply cursor-default;

		&:hover {
			@apply text-neutral-600 dark:text-neutral-400;
		}

		&.pressed {
			@apply text-secondary-600 dark:text-secondary-400;
		}
	}

	.shift-indicator-content {
		@apply fcol-1 bg-neutral-100 dark:bg-surface-800 rounded-md p-4 shadow-xl;
		@apply text-xs text-neutral-500 dark:text-neutral-300;
	}

	.note {
		@apply text-neutral-500 dark:text-neutral-400;
		@apply text-xs;
	}
</style>
