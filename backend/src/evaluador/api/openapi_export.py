"""Exporta el esquema OpenAPI de la API para generar los tipos del frontend.

Uso (desde backend/, con el entorno virtual activo):

    python -m evaluador.api.openapi_export > ../frontend/src/api/openapi.json
"""

import json
from typing import Any

from evaluador.api.main import app


def openapi_json() -> str:
    schema: dict[str, Any] = app.openapi()
    return json.dumps(schema, indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    print(openapi_json(), end="")
