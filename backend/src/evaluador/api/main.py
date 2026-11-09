"""Aplicación FastAPI."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from evaluador import __version__
from evaluador.api.routes import router

app = FastAPI(
    title="Evaluador semántico",
    description="Evalúa fórmulas de primer orden en interpretaciones finitas.",
    version=__version__,
)
app.include_router(router)

# En producción se sirve el build del frontend desde la misma app.
_FRONTEND_DIST = Path(__file__).resolve().parents[4] / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
