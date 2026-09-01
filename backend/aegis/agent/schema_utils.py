"""Turn a Pydantic model into a self-contained strict JSON schema.

Pydantic emits nested models as $defs plus $ref. Inlining them keeps the schema
we send flat and self-describing, and lets us assert additionalProperties:false
and a complete required list at every level.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from pydantic import BaseModel


def _inline(node: Any, defs: dict[str, Any], seen: tuple[str, ...] = ()) -> Any:
    if isinstance(node, list):
        return [_inline(item, defs, seen) for item in node]
    if not isinstance(node, dict):
        return node

    if "$ref" in node:
        name = node["$ref"].rsplit("/", 1)[-1]
        if name in seen:
            raise ValueError(f"recursive schema reference: {name}")
        target = deepcopy(defs[name])
        merged = _inline(target, defs, seen + (name,))
        for key, value in node.items():
            if key != "$ref":
                merged[key] = value
        return merged

    return {key: _inline(value, defs, seen) for key, value in node.items() if key != "$defs"}


def _harden(node: Any) -> Any:
    if isinstance(node, list):
        return [_harden(item) for item in node]
    if not isinstance(node, dict):
        return node

    out = {key: _harden(value) for key, value in node.items()}
    if out.get("type") == "object" and "properties" in out:
        out["additionalProperties"] = False
        out["required"] = list(out["properties"].keys())
    # Descriptions and defaults are noise once required is explicit.
    out.pop("default", None)
    return out


def strict_json_schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    defs = schema.get("$defs", {})
    return _harden(_inline(schema, defs))
