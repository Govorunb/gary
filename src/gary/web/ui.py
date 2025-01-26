import asyncio
import logging
import panel as pn

from panel.io.server import Server
from panel.template import VanillaTemplate

from .views import ActionView

from ..registry import REGISTRY, Game
from ..spec import *
from ..util import CONFIG

def create_game_tab(game: Game):
    async def live_actions_view():
        needs_update = True

        def update(*_):
            nonlocal needs_update
            needs_update = True

        game.subscribe("actions/register", update)
        game.subscribe("actions/unregister", update)
        game.subscribe("disconnect", update)

        while True:
            if needs_update:
                needs_update = False
                yield pn.Column(*map(lambda action: ActionView(action=action, game=game), game.actions.values()))
            await asyncio.sleep(1)

    async def live_context_log():
        needs_update = False
        
        def receive_context(ctx: str, silent: bool = False, ephemeral: bool = False):
            nonlocal needs_update
            needs_update = True
            classes = []
            if "Result for action" in ctx:
                if "Performing" in ctx:
                    classes.append("success")
                else:
                    classes.append("failure")
            elif silent:
                classes.append("silent")
            if ephemeral:
                ctx = f"~~{ctx}~~"
            
            ctx_log.append(
                pn.pane.Markdown(object=ctx, css_classes=classes),
            )
        
        game.subscribe("llm_context", receive_context)

        ctx_log = pn.Column(
            styles={
                "position": "fixed",
                "z-index": "1",
            },
            stylesheets=[
                """
                .success {
                    background-color: rgba(0, 255, 0, 0.2);
                }
                .failure {
                    background-color: rgba(255, 0, 0, 0.2);
                }
                .silent {
                    opacity: 0.8;
                }
                """
            ]
        )

        while True:
            if needs_update:
                needs_update = False
                yield ctx_log
            await asyncio.sleep(1)
    
    return (game.name, pn.Row(
        pn.Column("## Actions", live_actions_view),
        pn.Column("## Context", live_context_log),
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
        'ace', 'jsoneditor', # type: ignore
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
