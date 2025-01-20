import asyncio, logging
from typing import TYPE_CHECKING

from .manager_spec import Log
if TYPE_CHECKING:
    from ..util import ManagerWSConnection

class ManagerLogHandler(logging.Handler):
    def __init__(self):
        super().__init__()

    def emit(self, record):
        from ..registry import REGISTRY
        for manager in REGISTRY.managers.values():
            asyncio.create_task(self.send_log(manager, Log(
                timestamp=record.created,
                message=record.getMessage(),
                level=record.levelname))
            )

    async def send_log(self, manager: "ManagerWSConnection", log: Log):
        if manager.is_connected():
            await manager.send(log)
