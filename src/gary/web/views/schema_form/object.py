import functools
import html
import panel as pn

from loguru import logger
from typing import Any

from . import SchemaForm


class ObjectSchemaForm(SchemaForm):
    def __init__(self, *, schema: dict[str, Any], **params):
        self._labels = {}
        super().__init__(schema=schema, **params)
        self._widgets: dict[str, pn.Column] # type: ignore
    def _create_widgets(self):
        if not self.schema or self.schema.get("type") != "object":
            return

        properties = self.schema.get("properties", {})
        # required = self.schema.get("required", [])
        # TODO: additionalProperties

        self.value: dict[str, Any]
        required_props = self.schema.get("required", [])

        for prop_name, prop_schema in properties.items():
            subform = SchemaForm.create(schema=prop_schema, name=f"{self.name}.{prop_name}")
            widget = pn.Column(subform)
            self._widgets[prop_name] = widget
            if prop_name in required_props:
                label = pn.pane.HTML(f"<b>{html.escape(prop_name)}</b>", margin=(0,10))
            else:
                label = pn.widgets.Toggle(
                    name=html.escape(prop_name),
                    button_type='default',
                    button_style='outline',
                    margin=(0,10),
                )
                # late binding loop vars is just such a pythonic move
                def _toggle(prop, widget_, subform_, label_, evt):
                    pressed = evt.new
                    widget_.visible = pressed
                    logger.trace(f"toggled {prop} ({label_}) {'on' if evt.new else 'off'}\n{self.value=} {widget_=}")
                    if pressed:
                        self.value[prop] = subform_.value
                    else:
                        if prop in self.value:
                            del self.value[prop]
                    self.param.trigger('value')
                label.param.watch(functools.partial(_toggle, prop_name, widget, subform, label), 'value')
            label.align = ('start', 'center')
            self._labels[prop_name] = label

            def _ui_update(prop, evt):
                self.value[prop] = evt.new # type: ignore
                self.param.trigger('value')

            subform.param.watch(functools.partial(_ui_update, prop_name), ['value'])

        def _model_update(evt):
            required = self.schema.get('required', [])
            for prop_name, widget in self._widgets.items():
                is_required = prop_name in required
                subform = widget[0]
                if is_required:
                    if prop_name not in evt.new:
                        logger.warning(f"Property {prop_name} is required but was not in model update\n\tOld: {self.value}\n\tNew: {evt.new}")
                        continue
                else:
                    # optional added/removed
                    added = prop_name in evt.new
                    self._labels[prop_name].value = added
                    widget.visible = added
                    if not added:
                        continue
                val = evt.new[prop_name]
                if not hasattr(widget, 'value'):
                    continue # idk man
                if subform.value != val: # type: ignore
                    subform.value = val # type: ignore

        self.param.watch(_model_update, ['value'])

    def __panel__(self):
        # FIXME: use two columns
        items = []
        for prop_name, widget in self._widgets.items():
            items.append(
                pn.Row(
                    self._labels[prop_name],
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
