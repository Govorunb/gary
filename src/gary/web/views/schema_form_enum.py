import panel as pn
from .schema_form_base import SchemaForm

class EnumSchemaForm(SchemaForm):
    def _create_widgets(self):
        """Create widgets for enum types"""
        if not self.schema or "enum" not in self.schema:
            return

        enum_values = self.schema["enum"]
        widget = pn.widgets.Select(
            options=enum_values,
            value=enum_values[0] if enum_values else None,
            size=len(enum_values),
            margin=(10, 10),
            name="",
            sizing_mode="stretch_width"
        )
        self._widgets["value"] = widget
        widget.link(self, value='value', bidirectional=True)

    def __panel__(self):
        return self._widgets.get("value", pn.pane.Markdown(f"Invalid schema type for {EnumSchemaForm.__name__}"))
