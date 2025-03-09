import asyncio
import orjson
import panel as pn
import param

from typing import cast, get_args
from bokeh.models import Tooltip
from loguru import logger
from jsf import JSF

from ...llm.events import ClearContext
from ...llm.llm import SENDER_HUMAN
from ...util import bokeh_html_with_newlines, markdown_code_block
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
    _modal_style = """
.dialog-content {
    background-color: var(--background-color);
    max-width: 90%;
}
.pnx-dialog-close {background-color: revert;}
.pnx-dialog-close:hover {background-color: revert;}
"""

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

        # you can only have one modal... total. opening any modal opens all of them (probably an AllyDialog issue)
        # baffling how many normal expected things just don't work
        # and that apparently not a single other soul has ever tried to do these things
        modal = pn.Modal(
            (modal_contents := pn.Column()), # and it doesn't update direct contents properly :)
            min_width=600,
            show_close_button=True,
            background_close=True,
            stylesheets=[self._modal_style],
        )

        def _open_modal(contents: pn.viewable.Viewable):
            modal_contents[:] = [contents]
            modal.open = True

        def _close_modal(*_):
            modal_contents[:] = []
            modal.open = False

        def _get_command(t: type[Message]) -> str:
            return t.model_fields['command'].default

        msg_templates: dict[str, type[BaseModel]] = {
            # only neuro messages since this is the neuro side
            _get_command(t): t for t in get_args(AnyNeuroMessage)
        }

        def generate_template_json(template_name: str) -> str:
            if not (model_cls := msg_templates.get(template_name)):
                return ""

            schema = model_cls.model_json_schema()
            jsf = JSF(schema, allow_none_optionals=0) # 'command' is defined as optional for ease of instantiation but actually isn't
            return orjson.dumps(jsf.generate(), option=orjson.OPT_INDENT_2).decode()

        raw_input_modal = pn.Column(
            "<h1>Send Raw WS Message</h1>",
            "Send a raw websocket message to the game.",
            (raw_input := pn.widgets.CodeEditor(
                value='{\n\t"command": ""\n}',
                language='json',
                sizing_mode='stretch_width',
                min_height=300,
            )),
            pn.Row(
                pn.widgets.StaticText(value="Template:"),
                (template_select := pn.widgets.Select(
                    options=[""] + list(msg_templates.keys()),
                    value="",
                    width=200,
                )),
                pn.HSpacer(),
                (raw_send_button := pn.widgets.Button(name="Send", button_type="primary")),
            ),
        )

        def _update_template(evt):
            if not evt.new:
                return
            raw_input.value = generate_template_json(evt.new)

        template_select.param.watch(_update_template, 'value')

        @raw_send_button.on_click
        async def _(*_):
            msg = cast(str, raw_input.value)
            with raw_send_button.param.update(name="Sending...", disabled=True):
                await game.connection.ws.send_text(msg)
            _close_modal()

        send_raw_button = pn.widgets.Button(
            name="Send Raw",
            button_type='default',
            description=Tooltip(
                content="Send a raw websocket message.",
                position='top',
                attachment='above',
            ),
        )

        send_raw_button.on_click(lambda _: _open_modal(raw_input_modal))

        actions = pn.Column(
            "<h1>Actions</h1>",
            actions,
            pn.Row(
                mute_toggle_with_tooltip,
                pn.HSpacer(),
                send_raw_button,
                pn.Spacer(width=15), # space for gridstack resize handle

                margin=(5, 10),
            ),

            styles=self._css,
            sizing_mode='stretch_both',
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
            name="Show Context",
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
            visible=False,
        )

        context_modal = pn.Column(
            "# Context Window",
            ctx_dump_muted_md,
            context_md,
        )

        @dump_ctx_button.on_click
        async def _(*_):
            with dump_ctx_button.param.update(name="Retrieving...", disabled=True):
                await asyncio.sleep(0.1)
                context_dump = game.llm.dump()
                context_md.object = markdown_code_block(context_dump, "none")
                _open_modal(context_modal)
                was_unmuted = not cast(bool, mute_toggle.value)
                mute_toggle.value = True
                ctx_dump_muted_md.visible = was_unmuted
                while modal.open: # type: ignore
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
                await game.send_context(msg, SENDER_HUMAN)

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
            ),

            styles=self._css,
            sizing_mode='stretch_both',
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

        advanced = pn.Column(
            "<h1>Advanced</h1>",
            pn.Column(
                "## Layout\n\nThese settings are mostly for playing around and do not persist.",
                enable_resize,
                enable_drag,
                margin=(5, 10),
            ),
            modal,
            pn.VSpacer(),
            "If stuff breaks, try refreshing the page",
            sizing_mode='stretch_both',
            styles=self._css,
        )

        # NOTE: max 12 columns
        # https://github.com/gridstack/gridstack.js?tab=readme-ov-file#custom-columns-css
        grid[0:12, 0:4] = actions
        grid[0:12, 4:9] = context
        grid[0:12, 9:12] = advanced

        return grid
