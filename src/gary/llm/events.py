from dataclasses import dataclass, field
from datetime import datetime
from enum import IntEnum

from ..spec import ActionModel, ForceAction as ForceMessage

class Priority(IntEnum):
    """Priority levels for events.
    
    Lower numbers = higher priority.
    """
    FORCE = 0  # Force actions take precedence
    HIGH = 1   # Important events like context updates
    NORMAL = 2 # Standard events like try_action
    LOW = 3    # Non-critical events like say/sleep

@dataclass(kw_only=True)
class BaseEvent:
    timestamp: datetime = field(default_factory=datetime.now)
    priority: Priority = Priority.NORMAL

    def __lt__(self, other: 'BaseEvent') -> bool:
        # For priority queue ordering
        if not isinstance(other, BaseEvent):
            return NotImplemented
        return (self.priority, self.timestamp) < (other.priority, other.timestamp)

@dataclass
class Context(BaseEvent):
    ctx: str
    silent: bool = False
    '''
    If not silent, the model will be prompted to act when this event is processed.
    '''
    ephemeral: bool = False
    '''
    If ephemeral, anything resulting from this context (e.g. if the model chooses to act or say something) will not stay in the context window.
    '''
    persistent_llarry_only: bool = False
    '''
    Mark the message as persistent. Persistent messages always stay in the context window when it is trimmed.
    Take care not to overuse this - 

    Llarry only - Transformers/Guidance server/Randy don't do partial trimming so they ignore this.
    '''
    notify: bool = True
    '''Whether to send a 'context' event to any connected WebUI clients.'''

    def __post_init__(self):
        self.priority = Priority.HIGH

@dataclass
class TryAction(BaseEvent):
    '''Prompt the model to act.'''
    actions: list[ActionModel] | None = None
    '''Override for actions to choose from.'''
    allow_yapping: bool | None = None
    '''
    Whether to add 'say' to the model's options.

    If `None`, the value is taken from the config.
    '''
    ephemeral: bool = False
    '''
    If ephemeral, anything resulting from this event (e.g. if the model chooses to act or say something) will not stay in the context window.
    '''

@dataclass
class ForceAction(BaseEvent):
    '''Force the model to perform an action.'''
    force_message: ForceMessage | None = None
    '''
    The ForceAction message from the game that triggered this event.

    If not provided, any registered action (at the time this event is processed) will be picked.
    '''

    def __post_init__(self):
        self.priority = Priority.FORCE

@dataclass
class Say(BaseEvent):
    '''Force the model to say something.'''
    message: str | None = None
    '''
    Override for what to say.
    
    If not provided, will be generated by the model.
    '''
    ephemeral: bool = False
    '''
    If True, any downstream processing (e.g. notifying WebUI clients) will act on this message,
    but it will not stay in the context window, so the model will never know it said this.
    '''

    def __post_init__(self):
        self.priority = Priority.LOW

@dataclass
class Sleep(BaseEvent):
    duration: float

    def __post_init__(self):
        self.priority = Priority.LOW
