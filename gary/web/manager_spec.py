from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field, TypeAdapter

from ..spec import AnyGameMessage, AnyNeuroMessage

# pyright: reportIncompatibleVariableOverride=false

AnyClientMessageType = Literal[
    "send",
    "receive"
]

AnyServerMessageType = Literal[
    "message_sent",
    "message_received",
    "log",
]

class ClientMessage(BaseModel):
    type: AnyClientMessageType

class ServerMessage(BaseModel):
    type: AnyServerMessageType


class SendToGame(ClientMessage):
    type: Literal["send"] = "send"
    game: str
    '''Either a connection ID (preferred) or the game name.'''
    message: AnyNeuroMessage

class ReceiveFromGame(ClientMessage):
    type: Literal["receive"] = "receive"
    message: AnyGameMessage


class MessageSent(ServerMessage):
    type: Literal["message_sent"] = "message_sent"
    game: str
    message: AnyNeuroMessage

class MessageReceived(ServerMessage):
    type: Literal["message_received"] = "message_received"
    game: str
    message: AnyGameMessage

# TODO: maybe remove (terminal output already exists)
# TODO: batch logs (0.5s-1s interval)
class Log(ServerMessage):
    type: Literal["log"] = "log"
    timestamp: float # unix timestamp
    message: str
    level: str | int


AnyClientMessage = Union[SendToGame, ReceiveFromGame]
AnyServerMessage = Union[MessageSent, MessageReceived, Log]

ClientMessageAdapter: TypeAdapter[Annotated[AnyClientMessage, Field(discriminator="type")]]
ClientMessageAdapter = TypeAdapter(Annotated[AnyClientMessage, Field(discriminator="type")])

ServerMessageAdapter: TypeAdapter[Annotated[AnyServerMessage, Field(discriminator="type")]]
ServerMessageAdapter = TypeAdapter(Annotated[AnyServerMessage, Field(discriminator="type")])
