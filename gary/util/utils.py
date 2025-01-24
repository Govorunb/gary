import functools
from collections import defaultdict
from collections.abc import Callable, Coroutine
from typing import Any, overload, LiteralString

@overload
async def invoke[U](fn: Callable[..., Coroutine[Any, Any, U]], *args, **kwargs) -> U:
    ...
@overload
async def invoke[U](fn: Callable[..., U], *args, **kwargs) -> U:
    ...

async def invoke[U](fn: Callable[..., U] | Callable[..., Coroutine[Any, Any, U]], *args, **kwargs) -> U:
    ret = fn(*args, **kwargs)
    if isinstance(ret, Coroutine):
        return await ret
    return ret


# would be nice to have typed event args in addition to event names
# but i'm 95% certain it's not actually possible in python
class HasEvents[E: LiteralString]:
    def __init__(self):
        self.event_handlers = defaultdict(list)

    def subscribe(self, event: E, handler: Callable):
        '''
        Returns a function which unsubscribes the handler.
        '''
        self.event_handlers[event].append(handler)
        return functools.partial(self.unsubscribe, event, handler)
    
    def unsubscribe(self, event: E, handler: Callable):
        try:
            self.event_handlers[event].remove(handler)
        except ValueError:
            pass

    async def _raise_event(self, event: E, /, *args, **kwargs):
        # import traceback
        # from .logger import logger
        # stack_trace = "".join(traceback.format_stack()[-9:-4])
        # logger.debug(f"{self} raising event {event} on {len(self.event_handlers[event])} handlers with args {args} and kwargs {kwargs}\nStack trace: {stack_trace}")

        for handler in self.event_handlers[event]:
            await invoke(handler, *args, **kwargs)
