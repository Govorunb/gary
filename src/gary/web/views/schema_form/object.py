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
        self._widgets: dict[str, pn.Column]
        self.value: dict[str, Any]

    def _create_widgets(self):
        if not self.schema or self.schema.get("type") != "object":
            return

        properties = self.schema.get("properties", {})
        required_props = self.schema.get("required", [])
        # TODO: additionalProperties

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
                label.param.watch(functools.partial(self._on_toggle, prop_name, widget, subform, label), 'value')

            label.align = ('start', 'center')
            self._labels[prop_name] = label

            ui_update_handler = functools.partial(self._on_ui_update, prop_name)
            subform.param.watch(ui_update_handler, ['value'])

        self.param.watch(self._on_model_update, ['value'])

    def _on_toggle(self, prop_name, widget, subform, label, evt):
        '''Called when an optional property's toggle button is pressed.'''
        pressed = evt.new
        widget.visible = pressed
        logger.trace(f"toggled {prop_name} ({label}) {'on' if pressed else 'off'}\n{self.value=} {widget=}")

        if pressed:
            self.value[prop_name] = subform.value
        else:
            if prop_name in self.value:
                del self.value[prop_name]
        self.param.trigger('value')

    def _on_ui_update(self, prop_name, evt):
        '''Called when a subform changes its value.'''
        self.value[prop_name] = evt.new
        self.param.trigger('value')

    def _on_model_update(self, evt):
        '''Called when something sets self.value.'''
        required = self.schema.get('required', [])
        for prop_name, widget in self._widgets.items():
            is_required = prop_name in required
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

            # this isn't necessarily our SchemaForm object
            # panel replaces pn.viewable.Viewer objects with the actual ui element on render
            # so this could be a Markdown element or something
            subform = widget[0]
            if not hasattr(subform, 'value'):
                continue

            if getattr(subform, 'value') != val:
                setattr(subform, 'value', val)

    def __panel__(self):
        grid = pn.GridBox(ncols=2, sizing_mode='stretch_width')
        for prop_name, widget in self._widgets.items():
            grid.append(self._labels[prop_name])
            grid.append(widget)
        return pn.WidgetBox(
            grid,
            name=self.param.name,
            sizing_mode="stretch_width",
            styles={
                "border": "1px solid #3a3a3a",
                "border-radius": "5px",
                "padding": "3px",
                "max-height": 'none',
            }
        )
