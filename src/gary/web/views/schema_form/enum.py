import html
import panel as pn

from . import SchemaForm

class EnumSchemaForm(SchemaForm):
    def _create_widgets(self):
        if not self.schema or "enum" not in self.schema:
            return

        enum_values = self.schema["enum"]
        if len(enum_values) == 0:
            widget = pn.pane.Markdown(value="**No enum values provided**")
        elif len(enum_values) == 1:
            val = enum_values[0]
            if val is None:
                widget = pn.pane.Markdown("*(null)*")
            else:
                widget = pn.widgets.StaticText(value=html.escape(str(val)))
        else:
            widget = pn.widgets.Select(
                options=enum_values,
                value=enum_values[0],
                size=len(enum_values),
                margin=(10, 10),
                name="",
                sizing_mode="stretch_width"
            )
            widget.link(self, value='value', bidirectional=True)
        self._widgets["value"] = widget

    def __panel__(self):
        return self._widgets.get("value", pn.pane.Markdown(f"Invalid schema type for {EnumSchemaForm.__name__}"))
