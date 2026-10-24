<script lang="ts" module>
    import type z from "zod";
    import type { Component } from "svelte";
    import type { ControlProps, FieldKind } from "./field";
    import BooleanField from "./BooleanField.svelte";
    import NumberField from "./NumberField.svelte";
    import SelectField from "./SelectField.svelte";
    import TextField from "./TextField.svelte";
    import UrlField from "./UrlField.svelte";

    const controls: Record<FieldKind, Component<ControlProps<any>>> = {
        boolean: BooleanField,
        select: SelectField,
        number: NumberField,
        slider: NumberField,
        text: TextField,
        password: TextField,
        url: UrlField,
    };

    /** Nullable schemas are left out: their JSON schema is a union that no single control renders. */
    export type FieldSchema = z.ZodType<NonNullable<unknown> | undefined>;
</script>

<script lang="ts" generics="T extends FieldSchema">
    import type { Snippet } from "svelte";
    import { shortId } from "#lib/app/utils/index.js";
    import { fieldInfo } from "./field";

    interface Props {
        /** Label, help text, control and bounds come from the schema's `.field()` annotations and checks. */
        schema: T;
        value?: z.output<T>;
        /** Replaces the schema's description, e.g. to add links. */
        description?: string | Snippet;
        disabled?: boolean;
        /** Settings dialog layout: the description is a teaching tip beside the label. */
        tip?: boolean;
    }

    let { schema, value = $bindable(), description, disabled = false, tip = false }: Props = $props();

    const field = $derived(fieldInfo(schema));
    const Control = $derived(controls[field.kind]);
    const id = `input-${shortId()}`;
</script>

<Control {field} {id} help={description ?? field.description} {disabled} {tip} bind:value />
