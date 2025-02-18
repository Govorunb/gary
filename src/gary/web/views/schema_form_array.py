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

        self.value = []
        items = pn.rx([])
        watchers = []

        def can_add(items_):
            return max_items is None or len(items_) < max_items

        def can_remove(items_):
            return len(items_) > min_items

        def add_item(_):
            if not can_add(items.rx.value):
                return
            i = len(items.rx.value)  # type: ignore
            subform = SchemaForm.create(schema=items_schema, name=self.name+f"[{i}]")  # type: ignore
            items.rx.value += [subform]  # type: ignore
            val: list = self.value  # type: ignore
            if i == len(val):
                val.append(subform.value)  # type: ignore

            def _ui_update(evt):
                self.value[i] = evt.new  # type: ignore
                self.param.trigger('value')

            watchers.append(subform.param.watch(_ui_update, ['value']))

        def remove_item(_):
            if not can_remove(items.rx.value):
                return
            subform: SchemaForm = items.rx.value[-1]  # type: ignore
            subform.param.unwatch(watchers.pop())
            items.rx.value = items.rx.value[:-1]  # type: ignore
            val: list = self.value  # type: ignore
            while len(val) > len(items.rx.value):  # type: ignore
                val.pop()

        for _ in range(max(1, min_items)):
            add_item(None)
        self._widgets["items"] = items

        self.value = [widget.value for widget in items.rx.value]  # type: ignore

        def _model_update(evt):
            len_new = len(evt.new)
            len_old = len(items.rx.value)  # type: ignore
            updated_count = min(len_old, len_new)
            for i in range(updated_count):
                widget = items.rx.value[i]  # type: ignore
                widget.value = evt.new[i]  # type: ignore
            len_diff = len_new - len_old
            for _ in range(len_diff):
                add_item(None)
            for _ in range(-len_diff):
                remove_item(None)

        self.param.watch(_model_update, 'value')

        # Add/Remove buttons
        add_btn = pn.widgets.Button(name="+", button_type="light", width=30)
        remove_btn = pn.widgets.Button(name="-", button_type="light", width=30)
        self._widgets["add"] = add_btn
        self._widgets["remove"] = remove_btn

        add_btn.disabled = items.rx.pipe(can_add).rx.not_()
        remove_btn.disabled = items.rx.pipe(can_remove).rx.not_()

        add_btn.on_click(add_item)
        remove_btn.on_click(remove_item)

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
