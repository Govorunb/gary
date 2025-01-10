import os, sys, datetime, atexit
import logging, logging.handlers

from config import CONFIG

logging.addLevelName(0, "ALL")
logging.addLevelName(999999999, "NONE")
def map_log_level(level: str | int):
    return level if isinstance(level, int) else level.upper()
LOG_LEVEL_FILE = map_log_level(CONFIG.gary.log_level_file)
LOG_LEVEL_CONSOLE = map_log_level(CONFIG.gary.log_level_console)
LOG_FILENAME = f'_logs/log_{datetime.datetime.now():%Y-%m-%d_%H-%M-%S}.txt'

# loggers with level NOTSET will inherit from parent
logging.getLogger().setLevel(0)

logger = logging.getLogger('gary')
_fh = logging.FileHandler(LOG_FILENAME, mode = 'w')
_fh.setLevel(LOG_LEVEL_FILE)
_stdout = logging.StreamHandler(sys.stdout)
_stdout.setLevel(LOG_LEVEL_CONSOLE)
logger.addHandler(_fh)
logger.addHandler(_stdout)
logger.setLevel(0) # all

def _delete_empty():
    _fh.close()
    logger.removeHandler(_fh)
    logger.info("Exiting")
    if os.stat(LOG_FILENAME).st_size == 0:
        logger.debug("Removing empty log file")
        os.remove(LOG_FILENAME)
    _stdout.flush()
atexit.register(_delete_empty)
