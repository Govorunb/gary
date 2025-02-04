import asyncio
import re
import panel as pn
from panel.template import FastListTemplate

from ..util import CONFIG, logger
from ..registry import REGISTRY, Game
from ..spec import *
from .views import ActionView

def create_game_tab(game: Game):
    css = {
        "border": "1px solid black",
        "border-radius": "5px",
        "overflow": "scroll",
    }

    # TODO: class
    async def live_actions_view():
        needs_update = False
        tracked_actions: dict[str, ActionView] = {
            a.name: ActionView(action=a, game=game)
            for a in game.actions.values()
        }
        actions = pn.Column(
            *tracked_actions.values(),
            stylesheets=[
                """
                .unregistered {
                    text-decoration: line-through !important;
                    opacity: 0.5;
                    background-color: rgba(0, 0, 0, 0.1);
                }
                """
            ],
            styles={"max-height": "calc(100vh - 120px)"},
        )

        def update():
            nonlocal needs_update
            needs_update = True

        @pn.io.hold()
        def register(msg: RegisterActions):
            for a in msg.data.actions:
                if not (t := tracked_actions.get(a.name)):
                    t = tracked_actions[a.name] = ActionView(action=a, game=game)
                    actions.append(t)
                else:
                    t.action = a
                    t.is_registered = True
            update()

        @pn.io.hold()
        def unregister(msg: UnregisterActions):
            for name in msg.data.action_names:
                if (t := tracked_actions.get(name)):
                    t.is_registered = False
            update()

        def clear(*_):
            update()
            for a in tracked_actions.values():
                a.is_registered = False
            # tracked_actions.clear()

        game.subscribe("actions/register", register)
        game.subscribe("actions/unregister", unregister)
        game.subscribe("disconnect", clear)

        yield actions

        while True:
            if needs_update:
                needs_update = False
                yield actions
            await asyncio.sleep(1)

    # TODO: class
    async def live_context_log():
        needs_update = False

        def receive_context(ctx: str, silent: bool = False, ephemeral: bool = False):
            nonlocal needs_update
            needs_update = True
            classes = []
            if (m := re.match(r"Result for action (?:[^:])+: (?P<res>Performing|Failure)", ctx)):
                classes.append("success" if m.group("res") == "Performing" else "failure")
            if silent:
                classes.append("silent")
            additional_css = {'text-decoration': 'line-through'} if ephemeral else {}

            ctx_log.append(
                pn.widgets.StaticText(value=ctx, css_classes=classes, styles=additional_css),
            )

        game.subscribe("llm_context", receive_context)

        ctx_log = pn.Column(
            # styles={
            #     "position": "fixed",
            #     "z-index": "1",
            # },
            auto_scroll_limit=100,
            view_latest=True,
            scroll_button_threshold=100,
            stylesheets=[
                """
                .success {
                    background-color: rgba(0, 255, 0, 0.2);
                }
                .failure {
                    background-color: rgba(255, 0, 0, 0.2);
                }
                .silent {
                    opacity: 0.7;
                }
                """
            ],
            styles={"max-height": "calc(100vh - 120px)"},
        )

        while True:
            if needs_update:
                needs_update = False
                yield ctx_log
            await asyncio.sleep(1)

    grid = pn.GridStack(sizing_mode='stretch_both')

    actions = pn.Column("<h1>Actions</h1>", live_actions_view, styles=css)
    context = pn.Column("<h1>Context</h1>", live_context_log, styles=css)

    mute_toggle = pn.widgets.Checkbox(name="Mute LLM")
    enable_resize = pn.widgets.Checkbox(name="Allow resizing")
    enable_drag = pn.widgets.Checkbox(name="Allow dragging")

    def update_mute(muted):
        logger.info(f"User {'un' if not muted else ''}muted LLM in web UI")
        REGISTRY.mute_llm = muted

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
