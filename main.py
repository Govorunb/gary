import uvicorn
import uvicorn.config
from config import CONFIG

if __name__ == "__main__":
    uvicorn.run("app:app", **CONFIG.fastapi, reload_includes=['config.yaml'])
