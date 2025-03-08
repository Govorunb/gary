import html
import math
import panel as pn

from . import SchemaForm

class PrimitiveSchemaForm(SchemaForm):
    def _create_widgets(self):
        if not self.schema or self.schema.get("type") not in ("string", "number", "integer", "boolean", "null"):
            return

        schema_type = self.schema.get("type")
        widget = None

        # a lot of extra stuff like min/max, pattern, etc are intentionally not implemented
        # we don't want the inputs themselves to restrict possible values
        # being able to send invalid data is a feature (since this is for testing)
        # there's a JSON validation step that shows an error if something's wrong
        if schema_type == "string":
            widget = pn.widgets.TextInput(name="", sizing_mode="stretch_width")
        elif schema_type in ("number", "integer"):
            step = 1 if schema_type == "integer" else 0.1
            if multiple_of := self.schema.get("multipleOf"):
                step = multiple_of
            cls = pn.widgets.IntInput if schema_type == "integer" else pn.widgets.FloatInput
            widget = cls(
                name="",
                step=step,
                sizing_mode="stretch_width"
            )
            if schema_type != "integer":
                digits = math.ceil(-math.log10(step))
                widget.format = "0." + ("0" * digits)
                # there would be rounding code here (since bounds can get weird with rounding errors)
                # but there's no actual way to differentiate someone scrolling (intending to stay rounded to the step)
                # vs typing (manually inputting a value possibly intentionally between steps)
        elif schema_type == "boolean":
            widget = pn.widgets.Checkbox(name="")
        elif schema_type == "null":
            widget = pn.pane.Markdown("*(null)*")
        else:
            widget = pn.pane.Markdown(f"**Unsupported property type: {html.escape(str(schema_type))}**")

        widget.margin = (10, 10)
        self._widgets["value"] = widget
        if hasattr(widget, 'value'):
            widget.link(self, value='value', bidirectional=True)

    def __panel__(self):
        return self._widgets.get("value", pn.pane.Markdown(f"Invalid schema for {PrimitiveSchemaForm.__name__}"))
