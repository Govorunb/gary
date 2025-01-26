import json
import panel as pn
import param
from collections.abc import Mapping
from typing import Any
from jsf import JSF
from jsonschema import ValidationError, validate
from panel.custom import PyComponent

from ...util import logger
from ...registry import Game
from ...spec import ActionModel


class ActionView(PyComponent):
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
        self._parameterized = self.parametrize(action.schema, [action.name], True)

    def __panel__(self):
        name = self._action.name
        schema: dict[str, Any] | None = self._action.schema # type: ignore
        
        # no 'properties'
        if schema and schema.get("type", None) == "object" and not schema.get("properties", {}):
            schema = None
        
        description = self._action.description
        
        jsf = JSF(schema or {"additionalProperties": False}) if schema else None
        data = pn.widgets.JSONEditor(
            schema=schema,
            value=jsf.generate() if jsf else None,
            mode='text',
            sizing_mode='stretch_width',
        )
        send_button = pn.widgets.Button(name="Send", button_type='primary')

        def validate_json(val):
            if not schema:
                return False
            if val is None:
                return True
            
            try:
                validate(val, schema or {})
                return False
            except ValidationError:
                return True
        if data:
            send_button.disabled = pn.bind(validate_json, data)

        @send_button.on_click
        async def _(*e):
            if schema:
                print(f"{data.value=}")
                j = json.dumps(data.value)
            else:
                j = "{}"
            await self._game.execute_action(name, j)

        randy_button = pn.widgets.Button(name="Random", button_type='light')
        def reroll(*e):
            data.value = jsf.generate() if jsf else None
        randy_button.on_click(reroll)

        card = pn.Column(
            f"## `{name}`",
            description,
            pn.Card(
                pn.widgets.JSONEditor(value=schema, disabled=True, search=False, menu=False, sizing_mode='stretch_width'),
                title="Schema",
                collapsed=True
            ) if schema else None,
            pn.Card(
                pn.Row(
                    # data.controls(),
                    data
                ),
                # self._create_modal(),
                pn.Row(send_button, randy_button),
                title="Manual Send",
                collapsed=True,
            ) if schema else send_button,
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
