import asyncio
import panel as pn
from panel.template import FastListTemplate
from loguru import logger

from ..util import CONFIG
from ..registry import REGISTRY, Game
from ..spec import *
from .views import GameTab

def create_game_tab(game: Game):
    # tab header restricted to string. sad
    def live_tab_header():
        connected = pn.rx(game.connection.is_connected())
        def update():
            connected.rx.value = game.connection.is_connected()

        game.subscribe("connect", update)
        game.subscribe("disconnect", update)

        tab_header = pn.Row(
            game.name,
            pn.indicators.BooleanStatus(value=connected, width=16, height=16)
        )
        return tab_header

    return (game.name, GameTab(game))

async def create_tabs():
    needs_update = True
    welcome_msg = pn.Column(
            pn.panel(
                """<h1>Welcome!</h1>\n\n<h3>Waiting for game...</h3>""",
                align='center',
                styles={
                    "text-align": 'center',
                    "align-content": 'center',
                },
                stylesheets=["""div {text-align: center; align-content: center;}"""],
                sizing_mode='stretch_both',
            ),
            sizing_mode='stretch_both',
        )

    tabs = pn.Tabs(
        *(create_game_tab(game) for game in REGISTRY.games.values())
    )
    if len(tabs) == 0:
        tabs.append(("Welcome", welcome_msg))
    def _add_tab(game: Game):
        if tabs[0] is welcome_msg:
            tabs.pop(0)
        tabs.append(create_game_tab(game))
        nonlocal needs_update
        needs_update = True
    REGISTRY.subscribe("game_created", _add_tab)
    while True:
        if needs_update:
            needs_update = False
            yield tabs
        await asyncio.sleep(0.5)

def create_web_ui():
    extensions = ['gridstack', 'floatpanel', 'codeeditor', 'modal']
    pn.extension(
        *extensions,
        template='fast',
        theme='dark',
        throttled=True,
        notifications=True,
        # doesn't fire on server exit... womp womp
        disconnect_notification="Disconnected from server.\nPlease refresh the page",
        ready_notification="Connected",
    )

    template = FastListTemplate(
        title="Gary Control Panel",
        main=[pn.Column(create_tabs, sizing_mode='stretch_both')],
    )
    return template

connected_clients = 0

def add_control_panel(path: str):
    port = CONFIG.api.get('port', 8000) + 1 # TODO: separate config?
    args: dict = {
        'port': port,
        # panel's autoreload puts the process in the background in the terminal (ew)
        'autoreload': False, # not CONFIG.fastapi['reload'],
        # required - otherwise the fastapi app calls this from inside an event loop
        # (and the server here tries to start its own event loop - can't have two loops)
        'threaded': not CONFIG.api['reload'],
        'verbose': False,
        'show': False,
        'admin': True,
        'admin_log_level': 'INFO',
        'unused_session_lifetime_milliseconds': 1000, # would've been 1 or 500 but sometimes a session can get DC'd while connecting
        'check_unused_sessions_milliseconds': 500,
    }

    server = pn.serve({path: create_web_ui}, **args)

    connected_clients = 0
    def on_connect(_):
        nonlocal connected_clients
        connected_clients += 1
        logger.debug(f"(Web UI) Client connected, now {connected_clients} total")
    def on_disconnect(_):
        nonlocal connected_clients
        connected_clients -= 1
        logger.debug(f"(Web UI) Client disconnected, now {connected_clients} total")
        if connected_clients == 0:
            logger.info("(Web UI) All clients disconnected, unmuting all")
            for game in REGISTRY.games.values():
                game.scheduler.muted_web = False
    pn.state.on_session_created(on_connect)
    pn.state.on_session_destroyed(on_disconnect)

    print(f"Serving control panel at http://localhost:{port}/")
    return server
