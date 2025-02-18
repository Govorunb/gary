import logging
import panel as pn
from .schema_form_base import SchemaForm

_logger = logging.getLogger(__name__)

class ArraySchemaForm(SchemaForm):
    def _create_widgets(self):
        """Create widgets for array items"""
        if not self.schema or self.schema.get("type") != "array":
            return

        items_schema = self.schema.get("items", {})
        min_items = max(0, self.schema.get("minItems", 0))
        max_items = self.schema.get("maxItems", None)

        self.value: list = []
        items = pn.rx([])
        watchers = []

        def _ui_update(*_):
            self.value = [widget.value for widget in items.rx.value] # type: ignore

        def can_push(items_):
            return max_items is None or len(items_) < max_items

        def can_pop(items_):
            return len(items_) > min_items

        def push_item(_):
            widgets: list[SchemaForm] = items.rx.value # type: ignore
            if not can_push(widgets):
                return
            i = len(widgets)
            subform = SchemaForm.create(schema=items_schema, name=self.name+f"[{i}]") # type: ignore
            items.rx.value = widgets + [subform]
            val: list = self.value
            if i == len(val):
                val.append(subform.value)
            elif i < len(val):
                subform.value = val[i]
            else: # uhhhhhh
                _logger.error(f"{ArraySchemaForm.__name__}: push_item {i=} > {len(self.value)=} (value was trimmed but extra widgets weren't removed?)")

            watchers.append(subform.param.watch(_ui_update, ['value']))

        def pop_item(_):
            widgets: list[SchemaForm] = items.rx.value # type: ignore
            if not can_pop(widgets):
                return
            subform = widgets.pop()
            subform.param.unwatch(watchers.pop())
            items.rx.value = widgets.copy() # trigger watchers
            while len(self.value) > len(items.rx.value):
                self.value.pop()

        for _ in range(max(1, min_items)):
            push_item(None)
        self._widgets["items"] = items

        _ui_update()
        def _model_update(evt):
            i = 0
            widgets: list[SchemaForm] = items.rx.value # type: ignore
            for i, v in enumerate(evt.new):
                if i >= len(widgets):
                    push_item(None)
                elif v != widgets[i]:
                    widget = widgets[i]
                    widget.value = v
            for _ in range(i+1, len(widgets)):
                pop_item(None)

        self.param.watch(_model_update, 'value')

        # Add/Remove buttons
        add_btn = pn.widgets.Button(name="+", button_type="light", width=30)
        remove_btn = pn.widgets.Button(name="-", button_type="light", width=30)
        self._widgets["add"] = add_btn
        self._widgets["remove"] = remove_btn

        add_btn.disabled = items.rx.pipe(can_push).rx.not_()
        remove_btn.disabled = items.rx.pipe(can_pop).rx.not_()

        add_btn.on_click(push_item)
        remove_btn.on_click(pop_item)

    def _get_items_widgets(self, items):
        return pn.Column(*items, sizing_mode="stretch_width")

    def __panel__(self):
        return pn.Column(
            pn.bind(self._get_items_widgets, self._widgets["items"]),
            pn.Row(
                self._widgets["add"],
                self._widgets["remove"],
                sizing_mode="stretch_width"
            ),
            sizing_mode="stretch_width"
        )
