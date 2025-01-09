import logging
import logging.handlers
import sys
import datetime

from config import LOG_LEVEL_CONSOLE, LOG_LEVEL_FILE

logger = logging.getLogger('garry')
_fh = logging.FileHandler(f'_logs/log_{datetime.datetime.now():%Y-%m-%d_%H-%M-%S}.txt', mode = 'w')
_fh.setLevel(LOG_LEVEL_FILE)
logger.addHandler(_fh)
_stdout = logging.StreamHandler(sys.stdout)
_stdout.setLevel(LOG_LEVEL_CONSOLE)
logger.addHandler(_stdout)
logger.setLevel(logging.DEBUG)
