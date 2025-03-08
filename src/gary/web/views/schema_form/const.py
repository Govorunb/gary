from typing import Any
import panel as pn
import html

from . import SchemaForm

class ConstSchemaForm(SchemaForm):
    def __init__(self, schema: dict[str, Any], **params):
        super().__init__(schema=schema, **params)
        if 'value' not in params:
            self.value = schema.get('const')
    def _create_widgets(self):
        if not self.schema:
            return
        const_value = self.value
        if const_value is None:
            widget = pn.pane.Markdown("*(null)*")
        else:
            widget = pn.widgets.StaticText(value=html.escape(str(const_value)))
        widget.margin = (10, 10)
        self._widgets['value'] = widget

    def __panel__(self):
        return self._widgets.get('value', pn.pane.Markdown(f"Invalid schema type for {ConstSchemaForm.__name__}"))
