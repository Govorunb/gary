import logging
import os, sys
from loguru import logger
from .config import CONFIG

def map_log_level(level: str | int):
    return level if isinstance(level, int) \
        else level.upper()

def configure_logging():
    logger.level("ALL", 1)
    logger.level("NONE", 999999999)
    logger.level("DEBUG", color="<dim><lw>")
    logger.level("INFO", color="<lw>")
    logger.level("WARNING", color="<y>")

    LOG_AREA_ALIASES = {
        "game": "gary.registry",
        "llm": "gary.llm.llm",
        "scheduler": "gary.llm.scheduler",
        "websocket": "gary.util.websocket",
        "webui": "gary.web",
    }
    LOG_LEVEL_FILE = map_log_level(CONFIG.gary.logging.log_level_file)
    LOG_LEVEL_CONSOLE = map_log_level(CONFIG.gary.logging.log_level_console)
    LOG_FILENAME = '_logs/log_{time:YYYY-MM-DD_HH-mm-ss}.txt'

    # Remove default handler
    logger.remove()

    # https://github.com/Delgan/loguru/issues/1301#issuecomment-2663065215
    _level_filtering_by_module: dict = {}
    for name, log_level in CONFIG.gary.logging.modules.items():
        name = LOG_AREA_ALIASES.get(name, name)
        name = "gary." + name.removeprefix("gary.")
        _level_filtering_by_module[name] = map_log_level(log_level)

    os.makedirs('_logs', exist_ok=True)
    logger.add(LOG_FILENAME,
        level=LOG_LEVEL_FILE,
        filter=_level_filtering_by_module,
        format='[{time:YYYY-MM-DD HH:mm:ss}|{level:<8}|{name}:{line}] {message}',
        delay=True, # goated library
    )

    logger.add(sys.stdout,
        level=LOG_LEVEL_CONSOLE,
        filter=_level_filtering_by_module,
        format='<dim>[{name}]</dim> <level>{message}</level>',
        colorize=True
    )

    # https://github.com/bokeh/bokeh/blob/604e6f801974cedd6000835923bfb9030b64d461/src/bokeh/document/document.py#L377
    # https://github.com/python/cpython/blob/506c76f1bd252aeefb3b488903a9a1092e55ae04/Lib/logging/__init__.py#L2179
    logging.getLogger().addHandler(logging.NullHandler())
