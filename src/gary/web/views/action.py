import json
import panel as pn
import param
from collections.abc import Mapping
from typing import Any
from jsf import JSF
from jsonschema import ValidationError, validate
from panel.custom import PyComponent
from panel.reactive import Syncable

from ...util import logger
from ...registry import Game
from ...spec import ActionModel


class ActionView(PyComponent, Syncable):
    STYLE = """
:host(.force) {
    background-color: #ffaaaa;
}
"""
    is_force = param.Boolean(readonly=True)

    def __init__(self, *, action: ActionModel, game: Game, **params):
        assert isinstance(action, ActionModel)
        super().__init__(**params)
        self._action = action
        self._game = game
        # TODO: upgrade from JSON text editor to auto-generated forms
        self._parameterized = None
        # self._parameterized = self.parametrize(action.schema, [action.name], True)

    def __panel__(self):
        name = self._action.name
        schema: dict[str, Any] | None = self._action.schema # type: ignore

        # no 'properties'
        if schema and schema.get("type", None) == "object" and not schema.get("properties", {}):
            schema = None

        description = self._action.description

        jsf = JSF(schema or {"additionalProperties": False}) if schema else None
        # TODO: figure out CodeEditor (can't find ace clientside)
        data_input = pn.widgets.TextAreaInput(sizing_mode='stretch_width', auto_grow=True)

        def reroll(*_):
            data_input.value = json.dumps(jsf.generate(), indent=2) if jsf else ""
        reroll()

        send_button = pn.widgets.Button(name="Send", button_type='primary')
        randy_button = pn.widgets.Button(name="Random", button_type='light')
        error_text = pn.widgets.StaticText(value="", sizing_mode='stretch_width', styles={'color': 'red'})

        def validate_json(val: str):
            if not schema or val is None:
                return ""
            try:
                validate(json.loads(val), schema or {})
                return ""
            except ValidationError as e:
                return e.message
        error_text.value = pn.bind(validate_json, data_input)
        send_button.disabled = error_text.param.value.rx.bool()
        randy_button.rx.watch(reroll)

        @send_button.on_click
        async def _(*e):
            data: str = data_input.value if schema else "{}" # type: ignore
            await self._game.execute_action(name, data)

        card = pn.Card(
            description,
            pn.Card(
                # FIXME: jsoneditor breaks the page clientside when you try to remove it (something about `this.editor`)
                # currently worked around by not removing elements
                # pn.widgets.JSONEditor(value=schema, disabled=True, search=False, menu=False, sizing_mode='stretch_width'),
                f"```json\n{json.dumps(schema, indent=4)}\n```",
                title="Schema",
                collapsed=True
            ) if schema else None,
            pn.Card(
                pn.Row(
                    # data.controls(),
                    data_input
                ),
                # self._create_modal(),
                pn.Row(send_button, randy_button, error_text),
                title="Manual Send",
                collapsed=False,
            ) if schema else send_button,
            title=name,
            collapsed=True,
            stylesheets=[ActionView.STYLE],
            max_width=600,
            margin=20,
        )
        return card

    def _create_modal(self):
        # logger.error(f"{self._parameterized=}")
        return pn.Column(
            f"# Send {self._action.name}",
            pn.Param(self._parameterized),
        )

    @staticmethod
    def _bounds_val(schema: Mapping[str, Any], key: str):
        explicit = schema.get(key, None)
        if explicit is not None:
            return (explicit, True)
        exclusive = schema.get(key+"Exclusive", None)
        if exclusive is not None:
            return (exclusive, False)
        return (None, True)

    def parametrize(self, json_schema: Mapping[str, Any] | None, name: list[str], is_required: bool = False):
        if json_schema is None:
            return None

        params: dict = {
            'allow_None': not is_required,
            'label': name[-1],
            'doc': json_schema.get("description", None),
        }
        match (type_ := json_schema.get("type", None)):
            case "string":
                for p in ("minLength", "maxLength"):
                    if p in json_schema:
                        raise ValueError(f"{p} for strings is not supported")
                return param.String(regex=json_schema.get("pattern", None))
            case "number" | "integer":
                (min_value, min_is_inclusive)=self._bounds_val(json_schema, "minimum")
                (max_value, max_is_inclusive)=self._bounds_val(json_schema, "maximum")
                cls = param.Number if type_ == "number" else param.Integer
                return cls(bounds=(min_value, max_value), inclusive_bounds=(min_is_inclusive, max_is_inclusive), **params)
            case "boolean":
                return param.Boolean(**params)
            case "object":
                if not (props := json_schema.get("properties", None)):
                    logger.debug(f"{{'type': 'object'}} with no (or empty) 'properties'!\nProperty: {'.'.join(name)}\nSchema: {json_schema}")
                    # FIXME: {type: "object"} with no props shouldn't be an input field (maybe)
                    return param.Dict(constant=True, default={}, readonly=True, **params)
                required_props = json_schema.get("required", [])
                param_properties = {
                    prop_name: self.parametrize(prop_schema, name + [prop_name], prop_name in required_props)
                    for prop_name, prop_schema in props.items()
                }
                # TODO: nested panel
                cls = param.parameterized_class('.'.join(name), param_properties)
                cls.__doc__ = params["doc"]
                return cls()
            case "array":
                if not (items_schema := json_schema.get("items", None)): # noqa: F841
                    raise ValueError(f"Invalid schema; array properties must be constrained by 'items' key (schema: {json_schema})")
                min_items = json_schema.get("minItems", None)
                max_items = json_schema.get("maxItems", None)
                bounds = (min_items, max_items)
                # TODO: item_type restriction for items
                # (will probably have to write my own list parameter/component)
                return param.List(bounds=bounds, **params)
            case None if (enum := json_schema.get("enum", None)):
                return param.Selector(objects=enum, **params)
            case _:
                raise ValueError(f"Invalid schema; must contain a 'type' or 'enum' key (schema: {json_schema})")

    def __repr__(self, *_):
        return f"ActionView({self._action.name})"
