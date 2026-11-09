# Evaluador semántico — MM3032 Lógica Matemática

Aplicación web que determina si una fórmula de lógica de primer orden es **verdadera o falsa**
en una interpretación finita ingresada por el usuario, y explica por qué: testigos para
existenciales verdaderos, contraejemplos para universales falsos y comprobación completa
para universales verdaderos o existenciales falsos.

## Estructura

```
backend/    Núcleo lógico (Python puro) + API (FastAPI)
frontend/   Interfaz (React + TypeScript + Vite)
```

## Requisitos

- Python ≥ 3.12
- Node ≥ 22 y pnpm ≥ 10

## Desarrollo

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
fastapi dev src/evaluador/api/main.py     # http://localhost:8000
```

Frontend (en otra terminal):

```bash
cd frontend
pnpm install
pnpm dev                                   # http://localhost:5173 (redirige /api al backend)
```

## API

Documentación interactiva en `http://localhost:8000/docs` con el backend en marcha.

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/health` | Estado del servicio |
| POST | `/api/language/validate` | Valida las declaraciones del lenguaje |
| POST | `/api/formula/analyze` | Sintaxis, símbolos, variables libres y árbol sintáctico |
| POST | `/api/interpretation/validate` | Valida dominio, constantes, funciones y relaciones |
| POST | `/api/evaluate` | Evalúa un proyecto completo y devuelve la explicación |
| GET | `/api/examples` | Ejemplos de las presentaciones del curso |

Si la entrada tiene errores, `/api/evaluate` responde `ok: false` con los diagnósticos y
**sin** valor de verdad.

Formato de proyecto (el mismo que reciben `/api/evaluate` y los ejemplos):

```json
{
  "language": {
    "constants": ["i"],
    "functions": [{ "name": "f", "arity": 1 }],
    "predicates": [{ "name": "Q", "arity": 2 }]
  },
  "interpretation": {
    "domain": ["a", "b"],
    "constants": { "i": "a" },
    "functions": { "f": [{ "args": ["a"], "value": "b" }, { "args": ["b"], "value": "a" }] },
    "predicates": { "Q": [["a", "b"]] }
  },
  "formula": "∃y Q(i, y)",
  "environment": {}
}
```

## Pruebas y calidad

```bash
# backend (con el venv activo)
pytest --cov
ruff check . && ruff format --check .
mypy

# frontend
pnpm lint && pnpm typecheck && pnpm test
```

## Producción

```bash
cd frontend && pnpm build
cd ../backend && fastapi run src/evaluador/api/main.py
```

El backend sirve el build del frontend desde la misma URL.
