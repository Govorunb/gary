import re
import param
import panel as pn

from ...registry import Game

class LogEntry(pn.viewable.Viewer):
    value = param.String()
    success = param.Boolean(default=None, allow_None=True) # type: ignore
    silent = param.Boolean(default=False)
    ephemeral = param.Boolean(default=False)

    def __panel__(self):
        success: bool | None = self.success # type: ignore
        silent: bool = self.silent # type: ignore
        ephemeral: bool = self.ephemeral # type: ignore

        styles = {}
        if success is not None:
            styles['background-color'] = 'rgba(0, 255, 0, 0.2)' if success else 'rgba(255, 0, 0, 0.2)'
        if silent:
            styles['opacity'] = '0.7'
        if ephemeral:
            styles['text-decoration'] = 'line-through'

        return pn.widgets.StaticText(
            value=self.value,
            styles=styles
        )

class ContextLog(pn.viewable.Viewer):
    logs = param.List(default=[], item_type=LogEntry)

    def __init__(self, game: Game, *a, **kw):
        super().__init__(*a, **kw)
        self.game = game
        self.game.llm.subscribe('context', self.on_context)
        self.game.llm.subscribe('say', self.on_say)

    def __panel__(self):
        logs_col = pn.Column(
            auto_scroll_limit=100,
            scroll_button_threshold=3,
            sizing_mode='stretch_width',
        )
        # NOTE: scroll resets every time
        def _reset(_):
            logs_col[:] = self.logs # type: ignore
        self.param.watch(_reset, 'logs')
        return pn.Column(
            logs_col,
            styles={'flex': '1'}
        )

    def on_context(self, ctx: str, silent: bool = False, ephemeral: bool = False):
        m = re.match(r"Result for action (?:[^:])+: (?P<res>Performing|Failure)", ctx)
        new_log = LogEntry(
            value=ctx,
            success=m.group("res") == "Performing" if m else None,
            silent=silent,
            ephemeral=ephemeral
        )
        self.logs += [new_log] # type: ignore
    
    def on_say(self, msg: str):
        new_log = LogEntry(
            value='> '+msg,
            success=None,
            silent=False,
            ephemeral=False
        )
        self.logs += [new_log] # type: ignore
