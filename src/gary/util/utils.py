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

_GUIDANCE_SCHEMA_UNSUPPORTED_KEYWORDS = {
    "uniqueItems", # would be nice to get this even if just for enums
    "multipleOf", # works on llguidance/main but not in guidance yet
}

class FilteredSchema(NamedTuple):
    schema: dict | None = None
    filtered_keys: set[str] | None = None

def json_schema_filter(schema: dict | None) -> FilteredSchema:
    if schema is None:
        return FilteredSchema()

    out = {}
    replaced = set()
    for k,v in schema.items():
        if k in _GUIDANCE_SCHEMA_UNSUPPORTED_KEYWORDS:
            replaced.add(k)
            continue
        if isinstance(v, dict) and k != "enum": # enum members can be objects (dicts)
            if k == "properties":
                to_filter = v.items()
            else:
                to_filter = [(k,v)]
            for kk, vv in to_filter:
                (out[kk], sub_replaced) = json_schema_filter(vv)
                replaced.update(sub_replaced or set())
        else:
            out[k] = v
    return FilteredSchema(out, replaced)
