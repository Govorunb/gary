import asyncio
import jsonschema
import orjson
import sys

from collections import defaultdict
from collections.abc import MutableMapping
from loguru import logger
from typing import Any
from websockets import ClientConnection
from websockets.asyncio.client import connect

from gary.spec import *
from .util import Connection, Game, Handler

# shut up
import warnings
import logging
warnings.filterwarnings('ignore')
logging.getLogger('asyncio').setLevel(999999999)


def action(name: str, desc: str, schema: dict[str, Any]) -> ActionModel:
    return ActionModel(name=name, description=desc, schema=schema) # type: ignore

GAME = "JSON Schema Test"

ACTIONS = [
    action(
        "prim_str",
        "Must be a string.",
        {"type": "string"},
    ),
    action(
        "prim_int",
        "Must be an integer.",
        {"type": "integer"},
    ),
    action(
        "prim_bool",
        "Must be a boolean.",
        {"type": "boolean"},
    ),
    action(
        "prim_null",
        "Must be null.",
        {"enum": [None]},
    ),
    action(
        "array_empty",
        "Must be an array.",
        {"type": "array", "items": {"enum": [None]}},
    ),
    action(
        "array_unique",
        "Array with unique constraint.",
        {
            "type": "array",
            "items": {"enum": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"]},
            "minItems": 2,
            "maxItems": 4,
            "uniqueItems": True,
        },
    ),
    action(
        "obj",
        "Simple object.",
        {
            "type": "object",
            "properties": {
                "str_prop": {"type": "string"},
                "int_prop": {"type": "integer"},
                "null_prop": {"enum": [None]},
            },
            "required": ["str_prop", "int_prop", "null_prop"],
        },
    ),
    action(
        "complex_obj",
        "Object with nested primitives, arrays, and other objects.",
        {
            "type": "object",
            "properties": {
                "str_prop": {"type": "string"},
                "int_prop": {"type": "integer"},
                "null_prop": {"enum": [None]},
                "arr_prop": {
                    "type": "array",
                    "items": {"enum": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"]},
                    "minItems": 2,
                    "maxItems": 4,
                    "uniqueItems": True,
                },
                "obj_prop": {
                    "type": "object",
                    "properties": {
                        "str_prop": {"type": "string"},
                        "int_prop": {"type": "integer"},
                        "null_prop": {"enum": [None]},
                        "arr_prop": {
                            "type": "array",
                            "items": {"enum": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"]},
                            "minItems": 2,
                            "maxItems": 4,
                            "uniqueItems": True,
                        },
                        "obj_prop": {
                            "type": "object",
                            "properties": {},
                            "required": [],
                        },
                    },
                    "required": ["str_prop", "int_prop", "null_prop", "arr_prop", "obj_prop"],
                },
            },
            "required": ["str_prop", "int_prop", "null_prop", "arr_prop", "obj_prop"],
        },
    ),
    action(
        "array_of_obj",
        "Array of objects.",
        {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "str_prop": {"type": "string"},
                    "int_prop": {"type": "integer"},
                },
                "required": ["str_prop", "int_prop"],
            },
            "minItems": 2,
            "maxItems": 4,
            "uniqueItems": True,
        },
    ),
    action(
        "enum_primitive",
        "Enum with primitive members.",
        {
            "enum": ["string", 42, True],
        },
    ),
    action(
        "enum_obj",
        "Enum with object members.",
        {
            "enum": [{"str_prop": "string"}, {"int_prop": 42}, {"null_prop": None}],
        },
    ),
    # jsf doesn't support arrays as enum members
    # whoever PR'd object enum members in just... didn't add lists
    # Action(
    #     "enum_arrays_of_obj",
    #     "Enum whose members are arrays of objects.",
    #     {
    #         "enum": [
    #             [{"str_prop": "string"}, {"int_prop": 42}, {"null_prop": None}],
    #             [{"int_prop": 42}, {"null_prop": None}, {"str_prop": "string"}],
    #             [{"null_prop": None}, {"str_prop": "string"}, {"int_prop": 42}],
    #         ],
    #     },
    # ),
    action(
        "str_extra",
        "Extra properties for strings.",
        {
            "type": "object",
            "properties": {
                "freeform": {"type": "string"},
                "bounds": {
                    "type": "string",
                    "minLength": 5,
                    "maxLength": 10,
                },
                "pattern": {"type": "string", "pattern": "^[a-z]+$"},
                "format-datetime": {"type": "string", "format": "date-time"},
            },
            "required": ["freeform", "bounds", "pattern", "format-datetime"],
        }
    ),
    action(
        "num_extra",
        "Extra properties for numbers.",
        {
            "type": "object",
            "properties": {
                "freeform": {"type": "number"},
                "bounds-inclusive": {
                    "type": "number",
                    "minimum": 5,
                    "maximum": 10,
                },
                "bounds-exclusive": {
                    "type": "number",
                    "exclusiveMinimum": 5,
                    "exclusiveMaximum": 10,
                },
                "integer": {"type": "integer"},
                "int-step": {
                    "type": "integer",
                    "multipleOf": 2,
                },
                "float-step": {
                    "type": "number",
                    "multipleOf": 0.5,
                }
            },
            "required": ["freeform", "bounds-inclusive", "bounds-exclusive", "integer", "int-step", "float-step"],
        },
    ),
    action(
        "<b>html_inject</b>",
        "<i>Test HTML injection.</i>",
        {
            "type": "object",
            "properties": {
                "<u>underline</u>": {
                    "type": "string",
                    "default": "<marquee>test</marquee>",
                },
            },
            "required": ["<u>underline</u>"],
        }
    ),
]
test_actions = {action.name: action for action in ACTIONS}

class JSONSchemaTest(Game):
    def __init__(self, name: str, ws: Connection | ClientConnection):
        super().__init__(name, ws)
        self.handlers: MutableMapping[str, Handler] = defaultdict(lambda: self.default_handler)
        self.actions = test_actions
        self.ws.subscribe('receive', self.on_msg)
        self.subscribe('actions/reregister_all', self.hello)

    async def default_handler(self, name: str, data: Any) -> tuple[bool, str]:
        (success, response) = (True, f"Echo: {name=} {data=}")
        try:
            jsonschema.validate(data, self.actions[name].schema_ or {})
        except jsonschema.ValidationError as e:
            success = False
            response = f"Error: {e}"
            logger.warning(f"[{name}] Error: {e}")
        else:
            logger.success(f"[{name}] Success")
        return success, response

    async def hello(self, *_):
        await self.send(self.make_msg(Context, data={
            "message":
                "Welcome to the JSON Schema test. Please execute the actions available to you.\n"
                "You may deviate from the given schema, it is part of the test.",
            "silent": True
        }))

    async def on_msg(self, msg: AnyNeuroMessage):
        logger.debug(f"Received message: {msg}")
        match msg:
            case ReregisterAllActions():
                logger.success(f"Registering {len(self.actions)} actions")
                await self.send(RegisterActions, data={"actions": list(self.actions.values())})
            case Action():
                data: str | None = msg.data.data
                name = msg.data.name
                data = data and orjson.loads(data.encode())
                handler = self.handlers[name]
                (success, response) = await handler(name, data)
                if success:
                    await self.send(UnregisterActions, data={"action_names": [name]})
                result = {
                    "id": msg.data.id,
                    "success": success,
                    "message": response,
                }
                await self.send(ActionResult, data=result)
            case _:
                logger.warning(f"Unhandled message: {msg}")

async def main():
    logger.remove()
    logger.add(
        sys.stdout,
        colorize=True,
        format="{time:HH:mm:ss} | <le>{file}:{line}</> | <level>{message}</>",
        level="TRACE"
    )
    while True:
        try:
            async with connect("ws://localhost:8000") as ws:
                game = JSONSchemaTest(GAME, ws)
                await game.ws.lifecycle()
                logger.info("Disconnected")
        except Exception as e:
            logger.error(e)
            continue

def start():
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    start()
