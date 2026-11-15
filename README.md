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

## Uso

1. **Lenguaje**: declara constantes, símbolos funcionales y predicados con su aridad.
2. **Interpretación ℐ**: escribe los elementos del dominio 𝒟 y define cada símbolo: el valor de
   cada constante, la tabla completa de cada función y las tuplas de cada relación (casillas para
   predicados unarios, matriz para binarios, lista para aridad mayor).
3. **Fórmula**: usa la barra de símbolos o el teclado (`->` →, `&` ∧, `|` ∨, `~` ¬, `\A` ∀,
   `\E` ∃). Los errores se subrayan mientras escribes y se muestra cómo se interpretó la fórmula.
4. **Entorno**: si la fórmula tiene variables libres, asigna un elemento de 𝒟 a cada una.
5. **Evaluar** (o Ctrl + Enter): muestra Verdadero o Falso en la notación del curso y la
   justificación con testigos, contraejemplos o comprobación completa.

El proyecto se guarda automáticamente en el navegador. Con **Descargar** y **Cargar** se
comparte como JSON, y **Ejemplos del curso** carga los ejemplos de las presentaciones.

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
| POST | `/api/game/start` | Inicia el juego de Hintikka con el papel elegido por el usuario |
| POST | `/api/game/move` | Hace una jugada del juego: la del usuario o la de la máquina |

Si la entrada tiene errores, `/api/evaluate` responde `ok: false` con los diagnósticos y
**sin** valor de verdad.

### Juego de Hintikka

El servidor no guarda partidas: el cliente envía el estado completo en cada jugada.

1. `/api/game/start` recibe `{project, user_role}` (`"verificador"` o `"falsificador"`) y
   devuelve el estado: subfórmula actual, entorno, turno y opciones.
2. `/api/game/move` recibe `{state, move}` y hace una sola jugada. Con `move` juega el usuario
   (una de las opciones); con `move: null` juega la máquina. Responde
   `{state, machine_move, finished, winner, commentary, mistake}`, donde `mistake` indica que el
   usuario perdió su estrategia ganadora con esa jugada.

Si el proyecto tiene errores o la jugada no es válida, responde 422 y no se juega.

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

### Tipos de la API en el frontend

Los tipos de TypeScript se generan desde el esquema OpenAPI del backend. Después de cambiar
`backend/src/evaluador/api/schemas.py`:

```bash
cd backend && python -m evaluador.api.openapi_export > ../frontend/src/api/openapi.json
cd ../frontend && pnpm gen:api
```

Una prueba del backend falla si el esquema del frontend quedó desactualizado.

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
