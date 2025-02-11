import panel as pn
import param

from ...registry import Game
from ...spec import *
from .action import ActionView

class ActionsList(pn.viewable.Viewer):
    actions = param.List(default=[], item_type=ActionView)
    update_event = param.Event()

    def __init__(self, game: Game, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.game = game
        self.actions_by_name = {}
        self.game.subscribe("actions/register", self.register)
        self.game.subscribe("actions/unregister", self.unregister)
        self.game.subscribe("disconnect", self.clear)
        self._register(list(self.game.actions.values()))

    def register(self, msg: RegisterActions):
        self._register(msg.data.actions)
    def _register(self, actions: list[ActionModel]):
        for a in actions:
            if not (v := self.actions_by_name.get(a.name)):
                v = self.actions_by_name[a.name] = ActionView(action=a, game=self.game)
                self.actions += [v] # type: ignore
            else:
                v.is_registered = True
                v.action = a
        self.param.trigger('update_event')

    def unregister(self, msg: UnregisterActions):
        self._unregister(msg.data.action_names)
    def _unregister(self, action_names: list[str]):
        for name in action_names:
            if (t := self.actions_by_name.get(name)):
                t.is_registered = False
        self.param.trigger('update_event')

    def clear(self, *_):
        for a in self.actions_by_name.values():
            a.is_registered = False
        self.param.trigger('update_event')

    def __panel__(self):
        actions_col = pn.Column(
            objects=self.actions,
            stylesheets=[
                """
                .unregistered {
                    opacity: 0.5;
                    background-color: rgba(0, 0, 0, 0.1);
                }
                """
            ],
            scroll=True,
        )
        def _update(_event):
            actions_col[:] = _event.new
        self.param.watch(_update, 'actions')
        return pn.Column(
            actions_col,
            styles={'flex': '1'}
        )
