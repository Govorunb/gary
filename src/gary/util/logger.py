import os, sys, datetime, atexit
import logging, logging.handlers
import colorlog

from . import CONFIG

logging.addLevelName(1, "ALL")
logging.addLevelName(999999999, "NONE")
def map_log_level(level: str | int):
    return level if isinstance(level, int) else level.upper()
LOG_LEVEL_FILE = map_log_level(CONFIG.gary.log_level_file)
LOG_LEVEL_CONSOLE = map_log_level(CONFIG.gary.log_level_console)
LOG_FILENAME = f'_logs/log_{datetime.datetime.now():%Y-%m-%d_%H-%M-%S}.txt'

logger = logging.getLogger('gary')
_fh = logging.FileHandler(LOG_FILENAME)
_fh.setLevel(LOG_LEVEL_FILE)
_fh.formatter = logging.Formatter('[%(asctime)s - %(levelname)s] %(message)s')
_stdout = logging.StreamHandler(sys.stdout)
_stdout.setLevel(LOG_LEVEL_CONSOLE)
_stdout.formatter = colorlog.ColoredFormatter('%(log_color)s[%(levelname)-8s : %(name)s] %(message)s', log_colors={
    'DEBUG': 'white', # gray
    'INFO': 'light_white', # white
    'WARNING': 'yellow',
    'ERROR': 'red',
    'CRITICAL': 'bold_red',
})
logger.addHandler(_fh)
logger.addHandler(_stdout)
logger.setLevel(1) # all

def _delete_empty():
    _fh.close()
    logger.removeHandler(_fh)
    logger.info("Exiting")
    if os.path.exists(LOG_FILENAME) and os.stat(LOG_FILENAME).st_size == 0:
        logger.debug("Removing empty log file")
        os.remove(LOG_FILENAME)
    _stdout.flush()
atexit.register(_delete_empty)
