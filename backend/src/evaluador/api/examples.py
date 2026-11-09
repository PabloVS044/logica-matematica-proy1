"""Biblioteca de ejemplos (archivos JSON en `evaluador/examples`)."""

import json
from functools import cache
from importlib.resources import files

from evaluador.api.schemas import ExampleOut


@cache
def load_examples() -> list[ExampleOut]:
    directory = files("evaluador") / "examples"
    examples = []
    for entry in sorted(directory.iterdir(), key=lambda e: e.name):
        if entry.name.endswith(".json"):
            data = json.loads(entry.read_text(encoding="utf-8"))
            examples.append(ExampleOut(id=entry.name.removesuffix(".json"), **data))
    return examples
