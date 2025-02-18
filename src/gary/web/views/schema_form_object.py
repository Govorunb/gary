import functools
import html
import logging
from typing import Any
import panel as pn
from .schema_form_base import SchemaForm

_logger = logging.getLogger(__name__)

class ObjectSchemaForm(SchemaForm):
    def _create_widgets(self):
        """Create widgets for object properties"""
        if not self.schema or self.schema.get("type") != "object":
            return

        properties = self.schema.get("properties", {})
        # TODO: optionals
        # required = self.schema.get("required", [])
        # TODO: additionalProperties

        self.value: dict[str, Any]

        for prop_name, prop_schema in properties.items():
            subform = SchemaForm.create(schema=prop_schema, name=self.name+f".{prop_name}") # type: ignore
            self._widgets[prop_name] = subform

            def _ui_update(prop, evt):
                self.value[prop] = evt.new # type: ignore
                self.param.trigger('value')

            subform.param.watch(functools.partial(_ui_update, prop_name), ['value'])

        def _model_update(evt):
            for prop_name, widget in self._widgets.items():
                val = evt.new[prop_name]
                if widget.value != val:
                    widget.value = val

        self.param.watch(_model_update, ['value'])

    def __panel__(self):
        items = []
        for prop_name, widget in self._widgets.items():
            items.append(
                pn.Row(
                    pn.pane.Markdown(f"**{html.escape(prop_name)}**", margin=(0,10)),
                    widget,
                    sizing_mode="stretch_width"
                )
            )
        return pn.WidgetBox(
            *items,
            name=self.param.name,
            sizing_mode="stretch_width",
            styles={
                "border": "1px solid #3a3a3a",
                "border-radius": "5px",
                "padding": "2px",
                "max-height": 'none',
            }
        )
