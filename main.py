import uvicorn
import uvicorn.config
from gary.util import CONFIG

if __name__ == "__main__":
    uvicorn.run("gary.app:app", **CONFIG.fastapi, reload_includes=['config.yaml'])
