import uvicorn
import uvicorn.config
from .util import CONFIG
from .util.config import CONFIG_PATH


def start():
    # uvicorn calls logging.dictConfig
    #   -> existing log handlers are cleared
    #     -> our file logger's stream gets closed
    #     -> the file mode is 'w' so the logger, not wanting to truncate the existing log, SILENTLY drops the log record
    #       -> file logs are empty
    # really great that it doesn't raise an exception or anything
    # and it *only* started happening once i moved logger.py to a submodule
    # i love python and its ecosystem
    uvicorn.run(
        "gary.app:app",
        **CONFIG.api,
        reload_includes=[CONFIG_PATH],
        # reload_excludes=["src/gary/web/ui.py"]
    )

if __name__ == "__main__":
    start()
