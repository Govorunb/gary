import param
import panel as pn
import orjson
from typing import Any

class SchemaForm(pn.viewable.Viewer):
    schema = param.Dict() # type: ignore
    value = param.Parameter()
    error = param.String()
    
    def __init__(self, schema: dict[str, Any], **params):
        super().__init__(schema=schema, **params)
        self._widgets = {}
        self._create_widgets()
        self.schema: dict[str, Any]
        
    def _create_widgets(self):
        """Create widgets based on schema type"""
        if not self.schema:
            return
            
        if "enum" in self.schema:
            # Handle enum-only schema
            self._widgets["value"] = pn.widgets.Select(
                options=self.schema["enum"],
                name="",
                sizing_mode="stretch_width"
            )
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
        
        for prop_name, prop_schema in properties.items():
            is_required = prop_name in required
            label = f"{prop_name}{'*' if is_required else ''}"
            
            widget = SchemaForm(schema=prop_schema)
            self._widgets[prop_name] = widget
            
    def _create_array_widgets(self):
        """Create widgets for array items"""
        items_schema = self.schema.get("items", {})
        min_items = self.schema.get("minItems", 0)
        max_items = self.schema.get("maxItems", None)
        
        items = pn.rx([SchemaForm(schema=items_schema) for _ in range(max(1, min_items))])
        self._widgets["items"] = items
        self.value = items.rx.pipe(lambda x: [w.get_value() for w in x])
            
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
            items.rx.value += [SchemaForm(schema=items_schema)] # type: ignore
            
        def remove_item(_):
            if not can_remove(items.rx.value):
                return
            items.rx.value = items.rx.value[:-1] # type: ignore
        
        add_btn.on_click(add_item)
        remove_btn.on_click(remove_item)
    
    def _create_primitive_widget(self):
        """Create widget for primitive types"""
        schema_type = self.schema["type"]
        
        if enum := self.schema.get("enum"):
            self._widgets["value"] = pn.widgets.Select(
                options=enum,
                name="",
                sizing_mode="stretch_width"
            )
        elif schema_type == "string":
            format = self.schema.get("format")
            if format == "date-time":
                self._widgets["value"] = pn.widgets.DatetimeInput(name="", sizing_mode="stretch_width")
            else:
                self._widgets["value"] = pn.widgets.TextInput(name="", sizing_mode="stretch_width")
        elif schema_type in ("number", "integer"):
            self._widgets["value"] = pn.widgets.NumberInput(
                name="",
                step=1 if schema_type == "integer" else 0.1,
                sizing_mode="stretch_width"
            )
        elif schema_type == "boolean":
            self._widgets["value"] = pn.widgets.Checkbox(name="")
        
        self._widgets["value"]
            
    def _get_items_widgets(self, items):
        return pn.Column(*items, sizing_mode="stretch_width")

    def get_value(self) -> Any:
        """Get the current form value as a JSON-compatible object"""
        schema_type = self.schema.get("type")
        
        if schema_type == "object":
            result = {}
            for prop_name, widget in self._widgets.items():
                value = widget.get_value()
                if value is not None:
                    result[prop_name] = value
            return result
            
        elif schema_type == "array":
            return [w.rx.value.get_value() for w in self._widgets["items"]]
            
        elif "value" in self._widgets:
            return self._widgets["value"].value
            
        return None
    
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
