import logging
import param
import panel as pn
import orjson
from typing import Any

_logger = logging.getLogger(__name__)

class SchemaForm(pn.viewable.Viewer):
    schema = param.Dict() # type: ignore
    value = param.Parameter()

    def __init__(self, schema: dict[str, Any], **params):
        super().__init__(schema=schema, **params)
        # self.param.watch(print, ['value'])
        self._widgets = {}
        self._create_widgets()
        self.schema: dict[str, Any]
        print(self.name)

    def _create_widgets(self):
        """Create widgets based on schema type"""
        if not self.schema:
            return

        if "enum" in self.schema:
            enum_values = self.schema["enum"]
            widget = pn.widgets.Select(
                options=enum_values,
                value=enum_values[0] if enum_values else None,
                size=len(enum_values),
                name="",
                sizing_mode="stretch_width"
            )
            self._widgets["value"] = widget
            widget.link(self, value='value', bidirectional=True)
            return

        if "type" not in self.schema:
            return

        schema_type = self.schema["type"]
        if schema_type == "object":
            self._create_object_widgets()
        elif schema_type == "array":
            self._create_array_widgets()
        else:
            self._create_primitive_widget()

    def _create_object_widgets(self):
        """Create widgets for object properties"""
        properties = self.schema.get("properties", {})
        required = self.schema.get("required", [])
        # TODO: additionalProperties

        for prop_name, prop_schema in properties.items():
            is_required = prop_name in required
            label = f"{prop_name}{'*' if is_required else ''}"

            widget = SchemaForm(schema=prop_schema, name=self.name+f".{prop_name}") # type: ignore
            self._widgets[prop_name] = widget

        # Bind object values
        def get_object_value(*_):
            result = {}
            for prop_name, widget in self._widgets.items():
                value = widget.value
                if value is not None:
                    result[prop_name] = value
            return result
        self.value = get_object_value()

    def _create_array_widgets(self):
        """Create widgets for array items"""
        items_schema = self.schema.get("items", {})
        min_items = self.schema.get("minItems", 0)
        max_items = self.schema.get("maxItems", None)

        items = pn.rx([SchemaForm(schema=items_schema, name=self.name+f"[{i}]") for i in range(max(1, min_items))]) # type: ignore
        self._widgets["items"] = items

        # Bind array values
        def get_array_value(widget: SchemaForm):
            return widget.value # TODO: rx

        self.value = items.rx.map(get_array_value)

        # Add/Remove buttons
        add_btn = pn.widgets.Button(name="+", button_type="light", width=30)
        remove_btn = pn.widgets.Button(name="-", button_type="light", width=30)
        self._widgets["add"] = add_btn
        self._widgets["remove"] = remove_btn

        def can_add(items_):
            return max_items is None or len(items_) < max_items
        def can_remove(items_):
            return len(items_) > max(0, min_items)
        add_btn.disabled = items.rx.pipe(can_add).rx.not_()
        remove_btn.disabled = items.rx.pipe(can_remove).rx.not_()

        def add_item(_):
            if not can_add(items.rx.value):
                return
            items.rx.value += [SchemaForm(schema=items_schema, name=self.name+f"[{len(items.rx.value)}]")] # type: ignore

        def remove_item(_):
            if not can_remove(items.rx.value):
                return
            items.rx.value = items.rx.value[:-1] # type: ignore

        add_btn.on_click(add_item)
        remove_btn.on_click(remove_item)

    def _create_primitive_widget(self):
        """Create widget for primitive types"""
        schema_type = self.schema.get("type")

        widget = None
        if enum := self.schema.get("enum"):
            widget = pn.widgets.Select(
                options=enum,
                value=enum[0] if enum else None,
                name="",
                sizing_mode="stretch_width"
            )
        elif schema_type == "string":
            format = self.schema.get("format")
            if format == "date-time":
                widget = pn.widgets.DatetimeInput(name="", sizing_mode="stretch_width")
            else:
                widget = pn.widgets.TextInput(name="", sizing_mode="stretch_width")
        elif schema_type in ("number", "integer"):
            widget = pn.widgets.NumberInput(
                name="",
                step=1 if schema_type == "integer" else 0.1,
                sizing_mode="stretch_width"
            )
        elif schema_type == "boolean":
            widget = pn.widgets.Checkbox(name="")
        else:
            widget = pn.widgets.StaticText(value=f"Unsupported property type: {schema_type}")

        self._widgets["value"] = widget
        widget.link(self, value='value', bidirectional=True)

    def _get_items_widgets(self, items):
        return pn.Column(*items, sizing_mode="stretch_width")

    def __panel__(self):
        schema_type = self.schema.get("type")

        if schema_type == "object":
            items = []
            for prop_name, widget in self._widgets.items():
                items.append(
                    pn.Row(
                        pn.pane.Markdown(f"**{prop_name}**", margin=(5,10)),
                        widget,
                        sizing_mode="stretch_width"
                    )
                )
            return pn.Column(*items, sizing_mode="stretch_width")

        elif schema_type == "array":
            return pn.Column(
                pn.bind(self._get_items_widgets, self._widgets["items"]),
                pn.Row(
                    self._widgets["add"],
                    self._widgets["remove"],
                    align="end"
                ),
                sizing_mode="stretch_width"
            )

        elif "value" in self._widgets:
            return self._widgets["value"]

        return pn.pane.Markdown("Invalid schema")
