import re
import param
import panel as pn
import html

from ...registry import Game
from ...util import html_newlines

class LogEntry(pn.viewable.Viewer):
    value = param.String()

    def __panel__(self):
        return pn.widgets.StaticText(
            # it is a *text* widget, not an "i'll happily render anything as html" widget
            # why on earth would you not sanitize it internally
            # now i have to go and check every other place where text is displayed
            value=self.param.value.rx.pipe(html.escape).rx.pipe(html_newlines),
            css_classes=self._css_classes(),
            sizing_mode='stretch_width',
        )

    def _css_classes(self):
        return []

class ContextLogEntry(LogEntry):
    success = param.Boolean(default=None, allow_None=True) # type: ignore
    silent = param.Boolean(default=False) # type: ignore
    ephemeral = param.Boolean(default=False) # type: ignore

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.success: bool | None
        self.silent: bool
        self.ephemeral: bool
    
    def _css_classes(self):
        classes = ['source-game']
        if self.success is not None:
            classes.append('ctx-success' if self.success else 'ctx-failure')
        if self.silent:
            classes.append('ctx-silent')
        if self.ephemeral:
            classes.append('ctx-ephemeral')
        return classes

class SayLogEntry(LogEntry):
    def _css_classes(self):
        return ['source-llm']

class ContextLog(pn.viewable.Viewer):
    logs = param.List(default=[], item_type=LogEntry)
    new_log = param.Event()
    _css = """
.ctx-success {background-color: rgba(0, 255, 0, 0.2);}
.ctx-failure {background-color: rgba(255, 0, 0, 0.2);}
.ctx-silent {opacity: 0.7;}
.ctx-ephemeral {text-decoration: line-through;}

.source-llm {background-color: rgba(0, 255, 255, 0.2);}
.source-human {background-color: rgba(0, 0, 255, 0.1);}

.source-llm, .source-human, .source-game {
    position: relative;
    padding-left: 1.4rem;
}
.source-llm:before, .source-human:before, .source-game:before {
    position: absolute;
    left: 0;
    top: 0;
}
.source-llm:before {content:"💬";}
.source-human:before {content:"⌨️";}
.source-game:before {content:"🎮";}
"""

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
            stylesheets=[self._css],
        )
        def _reset(_):
            logs_col[:] = self.logs # type: ignore
        def _append(_):
            logs_col.append(self.logs[-1]) # type: ignore
        self.param.watch(_reset, 'logs')
        self.param.watch(_append, 'new_log')
        return pn.Column(
            logs_col,
            styles={'flex': '1'},
        )

    def on_context(self, ctx: str, silent: bool = False, ephemeral: bool = False):
        m = re.match(r"Result for action (?:[^:])+: (?P<res>Performing|Failure)", ctx)
        new_log = ContextLogEntry(
            value=ctx,
            success=m.group("res") == "Performing" if m else None,
            silent=silent,
            ephemeral=ephemeral
        )
        self._add_log(new_log)
    
    def on_say(self, msg: str):
        self._add_log(SayLogEntry(value=msg))
    
    def _add_log(self, log: LogEntry):
        self.logs.append(log) # type: ignore
        self.param.trigger('new_log')
