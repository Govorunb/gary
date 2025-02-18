import logging
import jsonschema
import param
import panel as pn

from jsf import JSF
from typing import Any, Type

_logger = logging.getLogger(__name__)

class SchemaForm(pn.viewable.Viewer):
    schema = param.Dict() # type: ignore
    value = param.Parameter()
    error = param.String() # type: ignore

    @classmethod
    def create(cls, schema: dict[str, Any], **params) -> 'SchemaForm':
        """Factory method to create the appropriate schema form based on the schema type"""
        # circular import
        from .enum import EnumSchemaForm
        from .primitive import PrimitiveSchemaForm
        from .array import ArraySchemaForm
        from .object import ObjectSchemaForm

        if "enum" in schema:
            return EnumSchemaForm(schema=schema, **params)

        schema_type = schema.get("type")
        if not schema_type:
            return cls(schema=schema, **params)

        form_classes: dict[str, Type['SchemaForm']] = {
            "object": ObjectSchemaForm,
            "array": ArraySchemaForm,
            "string": PrimitiveSchemaForm,
            "number": PrimitiveSchemaForm,
            "integer": PrimitiveSchemaForm,
            "boolean": PrimitiveSchemaForm,
        }

        form_class = form_classes.get(schema_type, cls)
        return form_class(schema=schema, **params)

    def __init__(self, schema: dict[str, Any], **params):
        super().__init__(schema=schema, **params)
        self._widgets = {}
        self._create_widgets()
        self.schema: dict[str, Any]
        self.error: str
        self.param.watch(self._validate_json, ['value'])
        self.randomize_value()

    def _create_widgets(self):
        """Create widgets based on schema type"""
        raise NotImplementedError("Subclasses must implement _create_widgets")

    def randomize_value(self):
        jsf = JSF(self.schema)
        self.value = jsf.generate()

    def _validate_json(self, evt):
        if not self.schema:
            self.error = ""
            return
        try:
            jsonschema.validate(evt.new, self.schema)
        except jsonschema.ValidationError as v:
            self.error = v.message
        else:
            self.error = ""

    def __panel__(self):
        raise NotImplementedError("Subclasses must implement __panel__")
