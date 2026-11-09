from pathlib import Path

from evaluador.api.openapi_export import openapi_json

FRONTEND_SCHEMA = Path(__file__).resolve().parents[3] / "frontend" / "src" / "api" / "openapi.json"


def test_frontend_schema_is_up_to_date() -> None:
    """Si falla, regenere los tipos: ver README, sección "Tipos de la API"."""
    assert FRONTEND_SCHEMA.read_text(encoding="utf-8") == openapi_json()
