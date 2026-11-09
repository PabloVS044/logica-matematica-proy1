"""Aplicación FastAPI."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from evaluador import __version__

app = FastAPI(title="Evaluador semántico", version=__version__)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


# En producción se sirve el build del frontend desde la misma app.
_FRONTEND_DIST = Path(__file__).resolve().parents[4] / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
