import functools
import logging
from jsf import JSF
import jsonschema
import orjson
import param
import panel as pn
from typing import Any

_logger = logging.getLogger(__name__)

class SchemaForm(pn.viewable.Viewer):
    schema = param.Dict() # type: ignore
    value = param.Parameter()
    error = param.String() # type: ignore

    def __init__(self, schema: dict[str, Any], **params):
        super().__init__(schema=schema, **params)
        # self.param.watch(print, ['value'])
        self._widgets = {}
        self._create_widgets()
        self.schema: dict[str, Any]
        self.error: str
        self.param.watch(self._validate_json, ['value'])
        self.randomize_value()

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
        # TODO: optionals
        # required = self.schema.get("required", [])
        # TODO: additionalProperties

        for prop_name, prop_schema in properties.items():
            subform = SchemaForm(schema=prop_schema, name=self.name+f".{prop_name}") # type: ignore
            self._widgets[prop_name] = subform
            def _ui_update(prop, evt):
                # _logger.warn(f"OBJ UI update - {prop=}\n\t{evt.new=}\n\t{self.value=}")
                self.value[prop] = evt.new # type: ignore
            subform.param.watch(functools.partial(_ui_update, prop_name), ['value'])

        def _model_update(evt):
            # _logger.warn(f"OBJ model update (obj)\n\t{evt.new=}\n\t{self._widgets=}")
            for prop_name, widget in self._widgets.items():
                # _logger.info(f"OBJ model update (widget)\n\t{evt.new=}\n\t{widget=}")
                widget.value = evt.new[prop_name] # type: ignore
        self.param.watch(_model_update, ['value'])

    def _create_array_widgets(self):
        """Create widgets for array items"""
        items_schema = self.schema.get("items", {})
        min_items = max(0, self.schema.get("minItems", 0))
        max_items = self.schema.get("maxItems", None)

        self.value = []
        items = pn.rx([])
        watchers = []
        def can_add(items_):
            return max_items is None or len(items_) < max_items
        def can_remove(items_):
            return len(items_) > min_items
        def add_item(_):
            if not can_add(items.rx.value):
                return
            i = len(items.rx.value) # type: ignore
            subform = SchemaForm(schema=items_schema, name=self.name+f"[{i}]") # type: ignore
            items.rx.value += [subform] # type: ignore
            val: list = self.value # type: ignore
            if i == len(val):
                val.append(subform.value) # type: ignore
            def _ui_update(evt):
                # _logger.warn(f"ARRAY UI update - {i=}\n\t{evt.new=}\n\t{self.value=}")
                self.value[i] = evt.new # type: ignore
                self.param.trigger('value')
            watchers.append(subform.param.watch(_ui_update, ['value']))
        def remove_item(_):
            if not can_remove(items.rx.value):
                return
            subform: SchemaForm = items.rx.value[-1] # type: ignore
            subform.param.unwatch(watchers.pop())
            items.rx.value = items.rx.value[:-1] # type: ignore
            val: list = self.value # type: ignore
            while len(val) > len(items.rx.value): # type: ignore
                val.pop()
        for _ in range(max(1, min_items)):
            add_item(None)
        self._widgets["items"] = items

        self.value = [widget.value for widget in items.rx.value] # type: ignore
        def _model_update(evt):
            # _logger.warn(f"ARRAY model update\n\t{evt.new=}\n\t{self.value=}")
            len_new = len(evt.new)
            len_old = len(items.rx.value) # type: ignore
            updated_count = min(len_old, len_new)
            for i in range(updated_count):
                widget = items.rx.value[i] # type: ignore
                widget.value = evt.new[i] # type: ignore
            len_diff = len_new - len_old
            for _ in range(len_diff):
                add_item(None)
            for _ in range(-len_diff):
                remove_item(None)
        self.param.watch(_model_update, 'value')

        # Add/Remove buttons
        add_btn = pn.widgets.Button(name="+", button_type="light", width=30)
        remove_btn = pn.widgets.Button(name="-", button_type="light", width=30)
        self._widgets["add"] = add_btn
        self._widgets["remove"] = remove_btn

        add_btn.disabled = items.rx.pipe(can_add).rx.not_()
        remove_btn.disabled = items.rx.pipe(can_remove).rx.not_()

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

    def randomize_value(self):
        jsf = JSF(self.schema)
        self.value = jsf.generate()

    def _validate_json(self, evt):
        if not self.schema:
            return
        val = evt.new
        try:
            jsonschema.validate(val, self.schema)
        except jsonschema.ValidationError as v:
            self.error = v.message
        except orjson.JSONDecodeError as j:
            self.error = j.msg
        else:
            self.error = ""
