import asyncio
import logging
import re
import panel as pn

from panel.io.server import Server
from panel.template import VanillaTemplate

from .views import ActionView

from ..registry import REGISTRY, Game
from ..spec import *
from ..util import CONFIG

def create_game_tab(game: Game):
    css = {
        "border": "1px solid black",
        "border-radius": "5px",
        "overflow": "scroll",
    }
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
                    text-decoration: line-through;
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

        def register(msg: RegisterActions):
            update()
            for a in msg.data.actions:
                if not (t := tracked_actions.get(a.name, None)):
                    t = tracked_actions[a.name] = ActionView(action=a, game=game)
                    actions.append(tracked_actions[a.name])
                else:
                    t.css_classes = []

        def unregister(msg: UnregisterActions):
            update()
            for name in msg.data.action_names:
                if (t := tracked_actions.get(name, None)):
                    t.css_classes = ["unregistered"]

        def clear(*_):
            update()
            nonlocal actions, tracked_actions
            for a in actions:
                a.css_classes = ["unregistered"]
            tracked_actions.clear()

        game.subscribe("actions/register", register)
        game.subscribe("actions/unregister", unregister)
        game.subscribe("disconnect", clear)

        yield actions

        while True:
            if needs_update:
                needs_update = False
                yield actions
            await asyncio.sleep(1)

    async def live_context_log():
        needs_update = False

        def receive_context(ctx: str, silent: bool = False, ephemeral: bool = False):
            nonlocal needs_update
            needs_update = True
            classes = []
            if (m := re.match(r"Result for action (?:[0-9a-f]{5}): (?P<res>Performing|Failure)", ctx)):
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
                # ctx_log.scroll_to(len(ctx_log.objects)-1) # type: ignore
            await asyncio.sleep(1)

    grid = pn.GridStack(sizing_mode='stretch_both')

    actions = pn.Column("# Actions", live_actions_view, styles=css)
    context = pn.Column("# Context", live_context_log, styles=css)

    mute_toggle = pn.widgets.Checkbox(name="Mute LLM", value=True)
    enable_resize = pn.widgets.Checkbox(name="Allow resizing", value=True)
    enable_drag = pn.widgets.Checkbox(name="Allow dragging (interferes with JSON editor)", value=False)
    def update_mute(muted):
        from ..registry import REGISTRY
        REGISTRY.mute_llm = muted
    def update_resize(can_resize):
        grid.allow_resize = can_resize
    def update_drag(can_drag):
        grid.allow_drag = can_drag

    config = pn.Column(
        "# Config",
        pn.Accordion(
            ("LLM", pn.Column(
                # FIXME: binds show up as empty space and idk how to hide them
                pn.Row(mute_toggle, pn.bind(update_mute, mute_toggle)),
                margin=(5, 10),
            )),
            ("Layout", pn.Column(
                pn.Row(enable_resize, pn.bind(update_resize, enable_resize)),
                pn.Row(enable_drag, pn.bind(update_drag, enable_drag)),
                margin=(5, 10),
            )),
            sizing_mode='stretch_width',
        ),
        pn.VSpacer(),
        sizing_mode='stretch_both',
        styles=css,
    )

    grid[0:10, 0:4] = actions
    grid[0:10, 4:8] = context
    grid[0:10, 8:10] = config
    return (game.name, grid)

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
        'gridstack', 'ace', 'jsoneditor', # type: ignore
        template='material',
        throttled=True,
        notifications=True,
        disconnect_notification="Disconnected from server.\nPlease make sure the server is running, then refresh this page",
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
