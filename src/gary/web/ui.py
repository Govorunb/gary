import logging
import panel as pn

from panel.io.server import Server
from panel.template import VanillaTemplate

from .views import ActionView

from ..registry import REGISTRY, Game
from ..spec import *
from ..util import CONFIG

def create_game_tab(game: Game):
    return (game.name, pn.FlexBox(
        # TODO: rx/hook to events to update in real time without needing to F5
        *map(lambda action: ActionView(action=action, game=game), game.actions.values()),
    ))

def create_tabs():
    # TODO: single tab view
    # something like:
    #      | LLM 'chat' log | metrics
    #      |                |
    # logs |________________|
    #      |Game1|Game2|    |________
    #      |actions         | config
    return pn.Tabs(
        *(create_game_tab(game) for game in REGISTRY.games.values()),
    )

def create_web_ui():
    pn.extension(
        # if i had a nickel for each time python devs half assed typing their libraries
        # i would invest them all back into open source to raise the average software quality
        'modal', 'ace', 'codeeditor', 'jsoneditor', # type: ignore
        template='material',
        throttled=True,
        notifications=True,
        disconnect_notification="Disconnected from server.\nPlease restart the server then refresh this page",
        ready_notification="Application loaded.",
    )
    template = VanillaTemplate(title="Gary Control Panel")
    template.main.append(create_tabs()) # type: ignore
    return template

def add_control_panel(path: str):
    logging.getLogger('bokeh').setLevel("WARNING")
    logging.getLogger('markdown_it').setLevel("WARNING")
    # TODO config
    port = 8001
    args: dict = {
        'port': port,
        # panel's autoreload puts the process in the background in the terminal
        # ew
        # 'autoreload': not CONFIG.fastapi['reload'],
        'autoreload': False,
        # required - otherwise the fastapi app calls this from inside an event loop
        # (and the server here tries to start its own event loop)
        'threaded': not CONFIG.fastapi['reload'],
        'verbose': False,
        'show': False,
        'admin': True,
        'admin_log_level': "INFO",
    }

    # with NoPrint():
    server: Server = pn.serve({path: create_web_ui}, **args) # type: ignore

    print(f"Serving control panel at http://localhost:{port}")
    return server
