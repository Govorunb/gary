import uvicorn
import uvicorn.config
from gary.util import CONFIG
from gary.util.config import CONFIG_PATH

if __name__ == "__main__":
    uvicorn.run("gary.app:app", **CONFIG.fastapi, reload_includes=[CONFIG_PATH])
