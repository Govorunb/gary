from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field, TypeAdapter

from ..registry import AnyGameMessage, AnyNeuroMessage

# pyright: reportIncompatibleVariableOverride=false

AnyClientMessageType = Literal[
    "send",
    "receive"
]

AnyServerMessageType = Literal[
    "message_sent",
    "message_received",
    "log",
    "metrics"
]

class ClientMessage(BaseModel):
    type: AnyClientMessageType

class ServerMessage(BaseModel):
    type: AnyServerMessageType


class SendToGame(ClientMessage):
    type: Literal["send"] = "send"
    message: AnyNeuroMessage

class ReceiveFromGame(ClientMessage):
    type: Literal["receive"] = "receive"
    message: AnyGameMessage


class MessageSent(ServerMessage):
    type: Literal["message_sent"] = "message_sent"
    message: AnyNeuroMessage

class MessageReceived(ServerMessage):
    type: Literal["message_received"] = "message_received"
    message: AnyGameMessage

class Log(ServerMessage):
    type: Literal["log"] = "log"
    message: str
    level: int

class MetricsEvent(ServerMessage):
    type: Literal["metrics"] = "metrics"
    data: str # arbitrary json (for now)

AnyClientMessage = Union[SendToGame, ReceiveFromGame]
AnyServerMessage = Union[MessageSent, MessageReceived, Log, MetricsEvent]

ClientMessageAdapter: TypeAdapter[Annotated[AnyClientMessage, Field(discriminator="type")]]
ClientMessageAdapter = TypeAdapter(Annotated[AnyClientMessage, Field(discriminator="type")])

ServerMessageAdapter: TypeAdapter[Annotated[AnyServerMessage, Field(discriminator="type")]]
ServerMessageAdapter = TypeAdapter(Annotated[AnyServerMessage, Field(discriminator="type")])
