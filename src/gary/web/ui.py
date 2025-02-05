import asyncio
import panel as pn
from panel.template import FastListTemplate

from ..util import CONFIG, logger
from ..registry import REGISTRY, Game
from ..spec import *
from .views import ContextLog, ActionsList


def create_game_tab(game: Game):
    css = {
        "border": "1px solid black",
        "border-radius": "5px",
        "overflow": "hidden",
        "height": "100%",
    }

    grid = pn.GridStack(sizing_mode='stretch_both')

    actions = pn.Column("<h1>Actions</h1>", ActionsList(game), styles=css, sizing_mode='stretch_both')
    context = pn.Column("<h1>Context</h1>", ContextLog(game), styles=css, sizing_mode='stretch_both')

    mute_toggle = pn.widgets.Checkbox(name="Mute LLM")
    enable_resize = pn.widgets.Checkbox(name="Allow resizing")
    enable_drag = pn.widgets.Checkbox(name="Allow dragging")

    def update_mute(muted):
        if game.mute_llm == muted:
            return
        logger.info(f"(Web UI) {'un' if not muted else ''}muted LLM for {game.name}")
        game.mute_llm = muted

    mute_toggle.rx.watch(update_mute)
    enable_resize.link(grid, value='allow_resize', bidirectional=True)
    enable_drag.link(grid, value='allow_drag', bidirectional=True)

    # TODO: localstorage for preferences?
    mute_toggle.value = True
    # checkbox initial value is False; grid properties' initial value is True
    # reactive programming claims yet another victim (nobody found out because there was no change notification)
    enable_resize.value = grid.allow_resize = True
    enable_drag.value = grid.allow_drag = False

    config = pn.Column(
        "<h1>Config</h1>",
        pn.Accordion(
            ("LLM", pn.Column(
                mute_toggle,
                margin=(5, 10),
            )),
            ("Layout", pn.Column(
                enable_resize,
                enable_drag,
                margin=(5, 10),
            )),
            sizing_mode='stretch_width',
        ),
        pn.VSpacer(),
        sizing_mode='stretch_both',
        styles=css,
    )

    # NOTE: max 12 columns
    # https://github.com/gridstack/gridstack.js?tab=readme-ov-file#custom-columns-css
    grid[0:12, 0:5] = actions
    grid[0:12, 5:10] = context
    grid[0:12, 10:12] = config

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

    # FIXME: tab header restricted to string
    return (game.name, grid)

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
    extensions = ['gridstack', 'floatpanel', 'ace', 'codeeditor']
    pn.extension(
        *extensions,
        template='fast',
        throttled=True,
        notifications=True,
        disconnect_notification="Disconnected from server.\nPlease make sure the server is running, then refresh this page",
        ready_notification="Application loaded.",
    )
    template = FastListTemplate(title="Gary Control Panel")
    template.main.append(pn.Column(create_tabs, sizing_mode='stretch_both')) # type: ignore
    return template

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
        'admin_log_level': "INFO",
    }

    server = pn.serve({path: create_web_ui}, **args)

    print(f"Serving control panel at http://localhost:{port}/?theme=dark")
    return server
