import builtins
import functools
from collections import defaultdict
from collections.abc import Callable, Awaitable
from typing import NamedTuple, overload, LiteralString

@overload
async def invoke[U](fn: Callable[..., Awaitable[U]], *args, **kwargs) -> U: ...
@overload
async def invoke[U](fn: Callable[..., U], *args, **kwargs) -> U: ...

async def invoke[U](fn: Callable[..., U] | Callable[..., Awaitable[U]], *args, **kwargs) -> U:
    ret = fn(*args, **kwargs)
    if isinstance(ret, Awaitable):
        return await ret
    return ret


# would be nice to have typed event args in addition to event names
# but i'm 95% certain it's not actually possible in python
class HasEvents[E: LiteralString]:
    def __init__(self):
        self.event_handlers = defaultdict(list)

    def subscribe(self, event: E, handler: Callable) -> Callable:
        '''
        Returns:
            A callable object tracking the subscription.
            When called, it will unsubscribe the handler.
        '''
        self.event_handlers[event].append(handler)
        # MAYBE: actual object representing the subscription
        # it can let us do things like:
        # - async generator that yields on each raised event
        return functools.partial(self.unsubscribe, event, handler)

    def unsubscribe(self, event: E, handler: Callable):
        try:
            self.event_handlers[event].remove(handler)
        except ValueError:
            pass

    async def _raise_event(self, event: E, /, *args, **kwargs):
        # import traceback
        # import logging
        # stack_trace = "".join(traceback.format_stack()[-9:-4])
        # logging.getLogger(__name__).debug(f"{self} raising event {event} on {len(self.event_handlers[event])} handlers with args {args} and kwargs {kwargs}\nStack trace: {stack_trace}")

        for handler in self.event_handlers[event]:
            await invoke(handler, *args, **kwargs)

class NoPrint:
    def __enter__(self):
        self._print = builtins.print
        def noop(*_, **__):
            pass
        builtins.print = noop

    def __exit__(self, *_):
        builtins.print = self._print

_empty_prop = {"enum": [None]}
# Adapted from https://github.com/guidance-ai/llguidance/blob/main/parser/src/json/schema.rs#L16
# (adjusted for currently released version of the python guidance library)
_GUIDANCE_SCHEMA_SUPPORTED_KEYWORDS = {
    # Core
    "anyOf": [_empty_prop],
    "oneOf": [_empty_prop],
    "allOf": [_empty_prop],
    "$ref": "#/definitions/a",
    "const": None,
    "enum": [None],
    "type": "null",
    # Array
    "items": _empty_prop,
    "additionalItems": _empty_prop,
    "prefixItems": [_empty_prop],
    "minItems": 0,
    "maxItems": 0,
    # Object
    "properties": {"a": _empty_prop},
    "additionalProperties": True,
    "required": ["a"],
    # String
    "minLength": 0,
    "maxLength": 0,
    "pattern": "",
    "format": "date-time",
    # Number
    "minimum": 0,
    "maximum": 0,
    "exclusiveMinimum": 0,
    "exclusiveMaximum": 0,
    # "multipleOf": 2, # not in guidance yet

    # Unimplemented
    # "$dynamicAnchor": "",
    # "$dynamicRef": "",
    # "$recursiveAnchor": "",
    # "$recursiveRef": "",
    # "not": _empty_prop,
    # "if": _empty_prop,
    # "then": _empty_prop,
    # "else": _empty_prop,
    # "dependencies": {"a": ["b"]},
    # "dependentSchemas": {"a": _empty_prop},
    # "dependentRequired": {"a": ["b"]},
    # "unevaluatedProperties": True,
    # "unevaluatedItems": _empty_prop,
    # "minProperties": 0,
    # "maxProperties": 0,
    # "propertyNames": _empty_prop,
    # "patternProperties": {"a": _empty_prop},
    # "contains": _empty_prop,
    # "maxContains": 0,
    # "minContains": 0,
    # "uniqueItems": True, # would be nice to get this even if just for enums

    # Meta/annotations - these do not affect validation
    "$id": "abcde",
    "$schema": "http://json-schema.org/draft-07/schema",
    "$defs": {"a": _empty_prop},
    "$anchor": "123",
    "contentEncoding": "",
    "contentMediaType": "",
    "description": "",
    "default": "",
    "examples": [""],
    "id": "abcde123",
    "title": "",
    "readOnly": True,
    "writeOnly": True,
    "definitions": {"a": _empty_prop},
}

class FilteredSchema(NamedTuple):
    schema: dict | None = None
    unsupported_keys: set[str] | None = None

def json_schema_filter(schema: dict | None) -> FilteredSchema:
    if schema is None:
        return FilteredSchema()

    out = {}
    unsupported = set()
    for k,v in schema.items():
        if k not in _GUIDANCE_SCHEMA_SUPPORTED_KEYWORDS:
            unsupported.add(k)
            continue
        if isinstance(v, dict) and k != "enum": # enum members can be objects (dicts)
            if k == "properties":
                out[k] = props = {}
                for kk, vv in v.items():
                    (props[kk], sub_unsupported) = json_schema_filter(vv)
                    unsupported.update(sub_unsupported or set())
            else:
                (out[k], sub_unsupported) = json_schema_filter(v)
                unsupported.update(sub_unsupported or set())
        else:
            out[k] = v
    return FilteredSchema(out, unsupported)

def _internal_test_keywords():
    from guidance import json
    try:
        json(schema=_GUIDANCE_SCHEMA_SUPPORTED_KEYWORDS)
    except ValueError as e:
        print(e)
    import sys
    print("Done")
    sys.exit(0)
# _internal_test_keywords()

# https://loguru.readthedocs.io/en/stable/api/logger.html ctrl+f "abbr" or "The color markups"
def loguru_tag(msg: str, tag: str):
    return f"<{tag}>{msg}</>"
