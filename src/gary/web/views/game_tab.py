import asyncio
import panel as pn
import param

from typing import cast
from bokeh.models import Tooltip
from loguru import logger

from ...llm.events import ClearContext
from ...util import bokeh_html_with_newlines, markdown_code_fence
from ...registry import Game
from ...spec import *
from .context_log import ContextLog
from .actions_list import ActionsList

class GameTab(pn.viewable.Viewer):
    _css = {
        "border": "1px solid black",
        "border-radius": "5px",
        "overflow": "hidden",
        "height": "100%",
    }
    def __init__(self, game: Game, *a, **kw):
        super().__init__(*a, **kw)
        with param.edit_constant(self):
            self.name = game.name
        self.game = game

    def __panel__(self):
        game = self.game
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

            styles=self._css, sizing_mode='stretch_both'
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
        
        dump_ctx_button = pn.widgets.Button(
            name="Dump Context",
            button_type='default',
            description=Tooltip(
                content=bokeh_html_with_newlines(
                    "Show the entire contents of the model's context window (working memory)."
                ),
                position='right',
            ),
        )

        context_md = pn.pane.Markdown()
        ctx_dump_muted_md = pn.pane.Markdown(
            "The model is muted while this dialog is open.",
            visible=False
        )

        context_modal = pn.Modal(
            "# Context Dump",
            ctx_dump_muted_md,
            context_md,
            show_close_button=True,
            background_close=True,
            stylesheets=[
                """
                .dialog-content {
                    background-color: var(--background-color);
                    max-width: 90%;
                    max-height: 100%;
                }
                .pnx-dialog-close {background-color: revert;}
                .pnx-dialog-close:hover {background-color: revert;}
                """
            ],
        )
        
        @dump_ctx_button.on_click
        async def _(*_):
            with dump_ctx_button.param.update(name="Retrieving...", disabled=True):
                await asyncio.sleep(0.1)
                context_dump = game.llm.dump()
                fence = markdown_code_fence(context_dump)
                context_md.object = f"{fence}none\n{context_dump}\n{fence}"
                context_modal.open = True
                was_unmuted = not cast(bool, mute_toggle.value)
                mute_toggle.value = True
                ctx_dump_muted_md.visible = was_unmuted
                while context_modal.open:
                    await asyncio.sleep(0.1)
                if was_unmuted:
                    mute_toggle.value = False

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
                pn.HSpacer(),
                dump_ctx_button,
                pn.Spacer(width=15), # space for gridstack resize handle
                context_modal,
            ),

            styles=self._css, sizing_mode='stretch_both'
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
            styles=self._css,
        )

        # NOTE: max 12 columns
        # https://github.com/gridstack/gridstack.js?tab=readme-ov-file#custom-columns-css
        grid[0:12, 0:4] = actions
        grid[0:12, 4:9] = context
        grid[0:12, 9:12] = config

        return grid
