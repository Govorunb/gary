import jsf.schema_types.string_utils.content_type.text__plain as jsf_text_utils
import panel as pn

import sys
import json
import param

from collections.abc import Mapping
from typing import Any, Literal
from jsf import JSF
from jsonschema import ValidationError, validate

from ...util import logger
from ...registry import Game
from ...spec import ActionModel

def _monkey_patch():
    '''
    Patch a JSF utility method to generate nothing if possible.
    Having to manually delete the prefilled Lorem Ipsum is annoying.
    '''
    _old = jsf_text_utils.random_fixed_length_sentence
    
    def _patch(_min: int = 0, _max: int = 0):
        if _min == 0:
            return ""
        return _old(_min, _max)
    
    jsf_text_utils.random_fixed_length_sentence = _patch
    for module in sys.modules.values():
        if hasattr(module, 'random_fixed_length_sentence') and module.random_fixed_length_sentence is _old:
            setattr(module, 'random_fixed_length_sentence', _patch)

_monkey_patch()

class ActionView(pn.custom.PyComponent, pn.reactive.Syncable):
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
        # (maybe, it's a lot of work and JSON is lowkey good enough)
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
        # TODO: shrink/grow to fit text
        # TODO: Ctrl+Enter to submit (this is impossible in panel. wtf)
        data_input = pn.widgets.CodeEditor(sizing_mode='stretch_width', language='json')

        def reroll(*_):
            val = json.dumps(jsf.generate(), indent=2) if jsf else ""
            data_input.value = val
        reroll()

        send_button = pn.widgets.Button(name="Send", button_type='primary')
        randy_button = pn.widgets.Button(name="Random", button_type='light')
        error_text = pn.widgets.StaticText(value="", sizing_mode='stretch_width', styles={'color': 'red'})

        def validate_json(val: str) -> str | Literal[""]:
            '''Returns: error message, if any.'''
            if not schema or val is None:
                return ""
            try:
                validate(json.loads(val), schema or {})
                return ""
            except ValidationError as v:
                return v.message
            except json.JSONDecodeError as j:
                return j.msg
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
                pn.pane.Markdown(f"```json\n{json.dumps(schema, indent=2)}\n```", sizing_mode='stretch_width'),
                title="Schema",
                collapsed=True,
                sizing_mode='stretch_width',
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
