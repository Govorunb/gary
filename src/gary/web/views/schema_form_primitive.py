import panel as pn
from .schema_form_base import SchemaForm

class PrimitiveSchemaForm(SchemaForm):
    def _create_widgets(self):
        """Create widget for primitive types"""
        if not self.schema or "type" not in self.schema:
            return

        schema_type = self.schema.get("type")
        widget = None

        if schema_type == "string":
            # TODO: min/max length
            widget = pn.widgets.TextInput(name="", sizing_mode="stretch_width")
        elif schema_type in ("number", "integer"):
            # TODO: min/max
            widget = pn.widgets.NumberInput(
                name="",
                step=1 if schema_type == "integer" else 0.1,
                sizing_mode="stretch_width"
            )
        elif schema_type == "boolean":
            widget = pn.widgets.Checkbox(name="")
        else:
            widget = pn.widgets.StaticText(value=f"Unsupported property type: {schema_type}")

        widget.margin = (10, 10)
        self._widgets["value"] = widget
        widget.link(self, value='value', bidirectional=True)

    def __panel__(self):
        return self._widgets.get("value", pn.pane.Markdown(f"Invalid schema for {PrimitiveSchemaForm.__name__}"))
