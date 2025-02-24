import asyncio
import sys
import orjson
import jsonschema

from websockets import ClientConnection, ConnectionClosed, State
from websockets.asyncio.client import connect
from loguru import logger
from typing import Any, NamedTuple

from gary.spec import *
from gary.util.utils import HasEvents

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

class WSConnection[TRecv: BaseModel, TSend: BaseModel](HasEvents[Literal["connect", "disconnect", "receive", "send"]]):
    def __init__(self, ws: ClientConnection, t_recv: TypeAdapter[TRecv], t_send: TypeAdapter[TSend]):
        super().__init__()
        self.ws = ws
        self.t_recv = t_recv
        self.t_send = t_send

    def is_connected(self):
        return self.ws.state == State.OPEN

    async def disconnect(self, code: int = 1000, reason: str = "Disconnected"):
        if not self.is_connected():
            return
        await self.ws.close(code, reason)
        await self._raise_event("disconnect", code, reason, False)

    async def send(self, message: TSend):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot send {message}")
            return
        text = orjson.dumps(message.model_dump(mode='json', by_alias=True)).decode()
        logger.trace(f'Sending: {text}')
        await self.ws.send(text)
        await self._raise_event("send", message)

    async def receive(self) -> TRecv:
        text = await self.ws.recv(True)
        if not text:
            raise ValueError("Received empty message")
        logger.trace(f'Received: {text}')
        model = self.t_recv.validate_json(text, strict=True)
        await self._raise_event("receive", model)
        return model

    async def lifecycle(self):
        await self._raise_event("connect")
        CloseEvent = NamedTuple("CloseEvent", [("code", int), ("reason", str), ("client_disconnected", bool)])
        close_event = CloseEvent(1000, "", False)
        try:
            while self.is_connected():
                await self.receive()
        except Exception as e:
            logger.trace(f"Disconnecting: {e}")
            if isinstance(e, ConnectionClosed):
                logger.info(f"WebSocket disconnected: [{e.code}] {e.reason}")
                close_event = CloseEvent(e.code, e.reason, True)
            else:
                logger.warning(f"Message handler error: ({type(e)}) {e}")
                close_event = CloseEvent(1011, "Internal error", False)
                await self.ws.close(close_event.code, close_event.reason)
                raise
        finally:
            await self._raise_event("disconnect", close_event)

class Connection(WSConnection[AnyNeuroMessage, AnyGameMessage]):
    def __init__(self, ws: ClientConnection):
        super().__init__(ws, TypeAdapter(AnyNeuroMessage), TypeAdapter(AnyGameMessage))
        self.ws = ws
        self.subscribe('receive', self.handler)

    async def handler(self, msg: AnyNeuroMessage):
        resp: dict = {"game": GAME}
        logger.debug(f"{msg=} {type(msg)=}")
        match msg:
            case ReregisterAllActions():
                resp["data"] = {"actions": ACTIONS}
                logger.success(f"Reregistering {len(ACTIONS)} actions")
                await self.send(RegisterActions(**resp))
                resp["data"] = {
                    "message": """
Welcome to the JSON Schema test. Please execute the actions available to you.
You may deviate from the given schema, it is part of the test.
""",
                    "silent": True
                }
                await self.send(Context(**resp))
            case Action():
                data: str = msg.data.data or ""
                name = msg.data.name
                data = orjson.loads(data.encode())
                response = f"Echo: {name=} {data=}"
                success = True
                try:
                    jsonschema.validate(data, test_actions[name].schema_ or {})
                except jsonschema.ValidationError as e:
                    response = f"Error: {e}"
                    logger.warning(f"[{name}] Error: {e}")
                    success = False
                else:
                    logger.success(f"[{name}] Success")
                if success:
                    resp["data"] = {"action_names": [name]}
                    await self.send(UnregisterActions(**resp))
                resp["data"] = {
                    "id": msg.data.id,
                    "success": success,
                    "message": response,
                }
                await self.send(ActionResult(**resp))
            case _:
                logger.warning(f"Unhandled message: {msg}")

async def main():
    logger.remove()
    logger.add(
        sys.stdout,
        colorize=True,
        format="{time:HH:mm:ss} | <le>{file}:{line}</> | <level>{message}</>",
        level="INFO"
    )
    while True:
        try:
            async with connect("ws://localhost:8000") as ws:
                conn = Connection(ws)
                await conn.lifecycle()
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
