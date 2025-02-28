import asyncio
import panel as pn
from bokeh.models import Tooltip
from panel.template import FastListTemplate
from loguru import logger

from ..llm.events import ClearContext
from ..util import CONFIG, bokeh_html_with_newlines
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

    actions = ActionsList(game)
    mute_toggle = pn.widgets.Switch(name="Tony Mode")
    mute_toggle_with_tooltip = pn.Row(
        mute_toggle,
        pn.widgets.StaticText(value=mute_toggle.name),
        pn.indicators.TooltipIcon(
            value=Tooltip(
                content=bokeh_html_with_newlines(
                    "Mutes the model, preventing it from performing any actions.\n"
                    "Makes it easier to send actions manually."
                ),
                position='top',
                attachment='above',
            ),
            margin=0,
        ),
    )
    actions = pn.Column(
        "<h1>Actions</h1>",
        actions,
        pn.Row(
            mute_toggle_with_tooltip
        ),

        styles=css, sizing_mode='stretch_both'
    )

    ctx_log = ContextLog(game)
    clear_context = pn.widgets.Button(
        name="Clear Context",
        button_type='default',
        description=Tooltip(
            content=bokeh_html_with_newlines(
                "Clear the model's context (working memory). Use this if the model gets into a loop of bad decisions.\n"
                "Testing/development only - you can't do this with Neuro!"
            ),
            position='right',
        ),
    )
    @clear_context.on_click
    async def _(*_):
        with clear_context.param.update(name="Clearing...", disabled=True):
            await asyncio.sleep(0.1)
            game.scheduler.enqueue(ClearContext())
            ctx_log.logs = []

    say_input = pn.widgets.TextInput(placeholder="Add message to context")
    say_button = pn.widgets.Button(
        name="Say",
        button_type='primary',
        description="Add a message to the model's context.",
    )

    async def _(*_):
        if not say_input.value:
            return
        msg = say_input.value
        say_input.value = ""
        with say_button.param.update(name="Sending...", disabled=True):
            await game.send_context("(SYSTEM) " + msg, silent=True)
    
    say_button.on_click(_)
    say_input.param.watch(_, 'enter_pressed')
    
    context = pn.Column(
        "<h1>Context</h1>",
        ctx_log,
        pn.Row(
            clear_context,
            say_input,
            say_button,
        ),

        styles=css, sizing_mode='stretch_both'
    )

    enable_resize = pn.widgets.Checkbox(name="Allow resizing")
    enable_drag = pn.widgets.Checkbox(name="Allow dragging")

    def update_mute(muted):
        if game.scheduler.muted == muted:
            return
        logger.info(f"(Web UI) {'un' if not muted else ''}muted '{game.name}'")
        game.scheduler.muted = muted

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
        "These settings are mostly for playing around and do not persist",
        pn.Accordion(
            # ("LLM", pn.Column(
            #     margin=(5, 10),
            # )),
            ("Layout", pn.Column(
                enable_resize,
                enable_drag,
                margin=(5, 10),
            )),
            sizing_mode='stretch_width',
            active=[0], # start with top card open
        ),
        pn.VSpacer(),
        "If stuff breaks, try refreshing the page",
        sizing_mode='stretch_both',
        styles=css,
    )

    # NOTE: max 12 columns
    # https://github.com/gridstack/gridstack.js?tab=readme-ov-file#custom-columns-css
    grid[0:12, 0:4] = actions
    grid[0:12, 4:9] = context
    grid[0:12, 9:12] = config

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
        theme='dark',
        throttled=True,
        notifications=True,
        disconnect_notification="Disconnected from server.\nPlease refresh the page",
        ready_notification="Connected",
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
                game.scheduler.muted = False
    pn.state.on_session_created(on_connect)
    pn.state.on_session_destroyed(on_disconnect)

    print(f"Serving control panel at http://localhost:{port}/")
    return server
