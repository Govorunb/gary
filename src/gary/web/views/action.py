import html
import jsf.schema_types.string_utils.content_type.text__plain as jsf_text_utils
import panel as pn

import param
import sys
import orjson
import jsonschema

from typing import Any, Literal
from jsf import JSF

from ...llm import Act
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

class ActionView(pn.viewable.Viewer, pn.reactive.Syncable):
    action = param.ClassSelector(class_=ActionModel)
    action_name = param.String(constant=True)
    action_description = param.String(constant=True)
    action_schema = param.Dict(constant=True)
    is_registered = param.Boolean(default=True)

    def __init__(self, *, action: ActionModel, game: Game, **params):
        assert isinstance(action, ActionModel)
        super().__init__(**params)
        self.action = action
        self._game = game

    def _action_model(self) -> ActionModel:
        return self.action # type: ignore

    @param.depends('action', watch=True)
    def _update_action_fields(self):
        with param.edit_constant(self):
            self.param.update(
                name=self._action_model().name,
                action_name=self._action_model().name,
                action_description=self._action_model().description,
                action_schema=self._action_model().schema_
            )

    def __panel__(self):
        def filter_schema(schema: dict[str, Any] | None):
            # no 'properties'
            if not schema or (schema.get("type") == "object" and not schema.get("properties")):
                return None
            # TODO: filter out {enum: [null]} (maybe)

            return schema
        # someone get me out
        # python rx is so ass
        # this is a haiku
        filtered_schema = param.bind(filter_schema, self.param.action_schema)

        def schema_card(schema: dict[str, Any] | None):
            if not schema:
                return None
            schema = orjson.loads(orjson.dumps(schema)) # to not mutate the original
            assert schema
            schema.pop('additionalProperties', None) # hide our injection to reduce confusion
            return pn.Card(
                pn.pane.Markdown(f"```json\n{orjson.dumps(schema, option=orjson.OPT_INDENT_2).decode()}\n```", sizing_mode='stretch_width'),
                title="Schema",
                collapsed=True,
                sizing_mode='stretch_width',
            )

        def manual_send_card(schema: dict[str, Any] | None):
            send_button = pn.widgets.Button(name="Send", button_type='primary')
            @send_button.on_click
            async def _(*_):
                # IMPL: null vs {} if no schema
                name: str = self.action_name # type: ignore
                data: str = data_input.value if schema else "{}" # type: ignore
                await self._game.execute_action(Act(name, data))

            if not schema:
                return pn.Row(send_button, margin=10)

            # TODO: handle {enum: [...]} (e.g. {enum: [null]})
            jsf = JSF(schema) if schema else None
            # TODO: upgrade from JSON text editor to auto-generated forms
            # (maybe, it's a lot of work and JSON is lowkey good enough)
            # TODO: shrink/grow vertically to fit text
            # TODO: Ctrl+Enter to submit (panel doesn't support key events. wtf)
            data_input = pn.widgets.CodeEditor(sizing_mode='stretch_width', language='json', min_height=100)

            def reroll(*_):
                data_input.value = orjson.dumps(jsf.generate(), option=orjson.OPT_INDENT_2).decode() if jsf else "{}"
            reroll()

            randy_button = pn.widgets.Button(name="Random", button_type='light')
            error_text = pn.widgets.StaticText(sizing_mode='stretch_width', styles={'color': 'red'})

            def validate_json(val: str) -> str | Literal[""]:
                '''
                Returns:
                    Error message, if any.
                '''
                assert schema, f"schema should have been filtered {schema=} {val=}"
                try:
                    jsonschema.validate(orjson.loads(val), schema)
                    return ""
                except jsonschema.ValidationError as v:
                    return v.message
                except orjson.JSONDecodeError as j:
                    return j.msg
            error_text.value = data_input.param.value.rx.pipe(validate_json).rx.pipe(html.escape)
            # send_button.disabled = error_text.rx.bool()
            randy_button.rx.watch(reroll)

            return pn.Card(
                data_input,
                pn.Row(send_button, randy_button, error_text),
                title="Manual Send",
                collapsed=False,
            )

        card = pn.Card(
            pn.widgets.StaticText(value=self.param.action_description.rx.pipe(html.escape), margin=10),
            pn.bind(schema_card, filtered_schema),
            pn.bind(manual_send_card, filtered_schema),
            title=self.param.action_name.rx.pipe(html.escape),
            collapsed=True,
            css_classes=self.param.is_registered.rx.where([], ["unregistered"]),
            sizing_mode='stretch_width',
            margin=(5, 20),
        )
        return card

    def __repr__(self, *_):
        return f"ActionView({self.action_name})"
