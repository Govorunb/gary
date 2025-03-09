from uvicorn import Server
from uvicorn.config import Config

from .util import CONFIG
from .util.config import CONFIG_PATH


def start():
    reload_includes = CONFIG.api.get("reload_includes", []) + [CONFIG_PATH]
    config = Config("gary.app:app", **CONFIG.api, reload_includes=reload_includes)
    server = Server(config)
    # FIXME: uvicorn really, really, really doesn't want to part with the KeyboardInterrupt it gets from the user
    try:
        server.run()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    start()
