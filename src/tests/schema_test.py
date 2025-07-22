import asyncio
import jsonschema
import orjson
import sys

from collections import defaultdict
from loguru import logger
from typing import Any
from websockets import ClientConnection
from websockets.asyncio.client import connect

from gary.spec import *
from .util import Connection, Game

# shut up
import warnings
import logging
warnings.filterwarnings('ignore')
logging.getLogger('asyncio').setLevel(999999999)


def action(name: str, desc: str, schema: dict[str, Any] | None) -> ActionModel:
    return ActionModel(name=name, description=desc, schema=schema) # type: ignore

ACTIONS = [
    action(
        "prim_str",
        "Freeform string.",
        {"type": "string"},
    ),
    action(
        "prim_int",
        "Freeform integer.",
        {"type": "integer"},
    ),
    action(
        "prim_bool",
        "Freeform boolean.",
        {"type": "boolean"},
    ),
    action(
        "prim_null",
        "Null type.",
        {"type": "null"},
    ),
    action(
        "enum_null",
        "The illusion of free choice.",
        {"enum": [None]},
    ),
    action(
        "const_null",
        "Constant null.",
        {"const": None},
    ),
    action(
        "const_str",
        "Constant string.",
        {"const": "Hello!"},
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
    # action(
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
        "mean_test",
        "Mean test for backends and frontends.",
        {
            "type": "object",
            "properties": {
                "oneOf": {
                    "enum": [
                        # this is an object literal - not a schema!
                        {
                            "$ref": None,
                            "type": "object",
                            "properties": {
                                "anyOf": {"type": "null"},
                                "null": {"type": "boolean"},
                                "<lr>hello loguru users</>": "<test><lr>ABCDE</>\\",
                            }
                        }
                    ]
                },
                "jsf bug #1e5e9": {"type": "integer", "maximum": -1},
                "": {"type": "integer", "minimum": 10000.5},
            },
            "required": ["oneOf", "jsf bug #1e5e9", ""],
        },
    ),
    action(
        "no_schema",
        "Action without schema.",
        None,
    ),
    
    # web ui tests
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
    action(
        "schema_update",
        "On first execution, the schema of this action will change.",
        {"type": "boolean"},
    ),
    action(
        "optional_props",
        "Test optional properties.",
        {
            "type": "object",
            "properties": {
                "optional_prop": {"type": "string"},
                "required_prop": {"type": "string"},
                "optional_obj": {
                    "type": "object",
                    "properties": {
                        "str_prop": {"type": "string"},
                        "int_prop": {"type": "integer"},
                        "null_prop": {"const": None},
                    },
                    "required": ["null_prop"],
                }
            },
            "required": ["required_prop"],
        }
    ),
    action(
        "negative_numbers",
        "Test negative numbers.",
        {
            "type": "object",
            "properties": {
                "constrained_int": {"type": "integer", "minimum": -1000, "maximum": -1},
                "constrained_float": {"type": "number", "minimum": -1000, "maximum": -1, "step": 0.1},
                "free_int_negative": {"type": "integer"},
                "free_float_negative": {"type": "number"},
                "free_int_positive": {"type": "integer"},
                "free_float_positive": {"type": "number"},
                # guidance fails the vibe check
                # "vibe_check": {"type": "number", "maximum": -1.23e45, "minimum": -2.34e56},
            },
            "required": [
                "constrained_int", "constrained_float",
                "free_int_negative", "free_float_negative",
                "free_int_positive", "free_float_positive",
            ]
        }
    )
]

focus = []
# focus = ["negative_numbers", "mean_test"]
test_actions = {action.name: action for action in ACTIONS}
if focus:
    test_actions = {name: test_actions[name] for name in focus}
samsara = True # when there's no more actions left, reregister them all again

class JSONSchemaTest(Game):
    def __init__(self, ws: Connection | ClientConnection):
        super().__init__("JSON Schema Test", ws)
        self.handlers = defaultdict(lambda: self.default_handler)
        self.actions = test_actions
        self.remaining_actions = self.actions.copy()
        self.ws.subscribe('receive', self.on_msg)
        self.subscribe('actions/reregister_all', self.hello)
        self._schema_changed = False
        self.handlers['schema_update'] = self._schema_update
        # uncomment to be extra mean to backends that rely on the Startup message
        # shoutouts to the 0 people that will ever run this against anything other than gary
        # self._sent_hello = True

    async def default_handler(self, name: str, data: Any) -> tuple[bool, str]:
        (success, response) = (True, f"Echo: {name=} {data=}")
        try:
            action = self.remaining_actions.get(name)
            if not action:
                action = self.actions.get(name)
                if not action:
                    logger.error(f"[{name}] Unknown action")
                    return (False, f"Unknown action '{name}'")
                else:
                    logger.warning(f"Called '{name}' out of turn (unregistered)")
            jsonschema.validate(data, action.schema_ or {})
        except jsonschema.ValidationError as e:
            success = False
            response = f"Error: {e}"
            logger.warning(f"[{name}] Error: {e}")
        else:
            logger.success(f"[{name}] Success")
        if success:
            self.remaining_actions.pop(name)
            await self.send(UnregisterActions, data={"action_names": [name]})
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
                self.remaining_actions = self.actions.copy()
                await self.send(RegisterActions, data={"actions": list(self.actions.values())})
            case Action():
                data: str | None = msg.data.data
                name = msg.data.name
                try:
                    data = data and orjson.loads(data.encode())
                except orjson.JSONDecodeError as e:
                    success = False
                    response = f"Error: {e}"
                else:
                    handler = self.handlers[name]
                    (success, response) = await handler(name, data)
                result = {
                    "id": msg.data.id,
                    "success": success,
                    "message": response,
                }
                await self.send(ActionResult, data=result)
                if samsara and not self.remaining_actions:
                    logger.info("No more actions - reregistering all. The eternal cycle continues")
                    await self.on_msg(ReregisterAllActions())
                    self._schema_changed = False
            case _:
                logger.warning(f"Unhandled message: {msg}")

    async def _schema_update(self, name: str, data: Any):
        res = await self.default_handler(name, data)
        if res[0] and not self._schema_changed:
            self._schema_changed = True
            action = self.actions[name].model_copy()
            action.schema_ = {"type": "string"}
            self.remaining_actions[action.name] = action
            await self.send(RegisterActions, data={"actions": [action]})
            res = (True, "Schema updated - try again")
        return res

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
                game = JSONSchemaTest(ws)
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
