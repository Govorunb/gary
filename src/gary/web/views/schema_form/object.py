import functools
import html
import panel as pn

from loguru import logger
from typing import Any

from . import SchemaForm


_warned_props = set()

class ObjectSchemaForm(SchemaForm):
    def _create_widgets(self):
        if not self.schema or self.schema.get("type") != "object":
            return

        properties = self.schema.get("properties", {})
        # required = self.schema.get("required", [])
        # TODO: additionalProperties

        self.value: dict[str, Any]

        for prop_name, prop_schema in properties.items():
            subform = SchemaForm.create(schema=prop_schema, name=f"{self.name}.{prop_name}")
            self._widgets[prop_name] = subform

            def _ui_update(prop, evt):
                self.value[prop] = evt.new # type: ignore
                self.param.trigger('value')

            subform.param.watch(functools.partial(_ui_update, prop_name), ['value'])

        def _model_update(evt):
            for prop_name, widget in self._widgets.items():
                if prop_name not in evt.new:
                    if prop_name not in _warned_props:
                        logger.warning(f"Property {prop_name} not in model update - is it meant to be optional? Did you forget 'required' in the schema?")
                        _warned_props.add(prop_name)
                    continue
                val = evt.new[prop_name]
                if widget.value != val:
                    widget.value = val

        self.param.watch(_model_update, ['value'])

    def __panel__(self):
        items = []
        for prop_name, widget in self._widgets.items():
            items.append(
                pn.Row(
                    pn.pane.HTML(f"<b>{html.escape(prop_name)}</b>", margin=(0,10)),
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
                "padding": "3px",
                "max-height": 'none',
            }
        )
