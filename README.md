# Evaluador semántico — MM3032 Lógica Matemática

Aplicación web que determina si una fórmula de lógica de primer orden es **verdadera o falsa**
en una interpretación finita ingresada por el usuario, y explica por qué: testigos para
existenciales verdaderos, contraejemplos para universales falsos y comprobación completa
para universales verdaderos o existenciales falsos.

La evaluación se puede **ver en 3D**: como un *universo* (la interpretación, con sus elementos y
relaciones) o como una *máquina* (la fórmula, con una pieza por subfórmula), animada paso a
paso y narrada en lenguaje sencillo.

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

En Windows, si el sistema no tiene Python 3.12, `uv` crea el entorno con esa versión sin
tocar el Python instalado:

```bash
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe -e '.[dev]'
.venv/Scripts/fastapi dev src/evaluador/api/main.py
```

Frontend (en otra terminal):

```bash
cd frontend
pnpm install
pnpm dev                                   # http://localhost:5173 (redirige /api al backend)
```

## Uso

La escena 3D ocupa toda la pantalla. Arriba está la barra con la configuración y las vistas;
abajo, la fórmula.

1. **Lenguaje · Interpretación · Entorno** (barra superior): abren un modal con pestañas.
   - **Lenguaje**: tres columnas, una por familia de símbolos. Las constantes nombran
     elementos, las funciones devuelven un elemento y los predicados responden V o F. Cada
     símbolo se ve con sus lugares vacíos, por ejemplo `R(□, □)`, y la aridad se cambia con − / +.
   - **Interpretación ℐ**: los elementos del dominio 𝒟 son fichas. Las constantes y cada
     entrada de una función (`s(0) ↦ □`) son cajitas: se arrastra una ficha adentro, o se toca la
     cajita y luego la ficha, y se pasa sola a la siguiente vacía. Un predicado unario es un
     conjunto: se tocan o arrastran las fichas para meterlas o sacarlas. Uno binario es un
     tablero donde cada casilla encendida es una flecha `a → b`, como en el universo. Para
     aridad mayor, la tupla se arma con cajitas.
   - **Entorno**: cada variable libre es una cajita donde se pone su elemento de 𝒟.

   Con hasta 14 elementos, cada parte también se dibuja como en el pizarrón, y los dibujos se
   pueden tocar: un mini universo con las constantes y variables colgando de su elemento, el
   diagrama de Venn de cada predicado unario, el grafo con flechas de cada binario, el diagrama
   de flechas de cada función unaria y la tabla de Cayley (un color por elemento) de cada
   operación binaria. Cada símbolo del lenguaje lleva el ícono de su pieza en la máquina.

   Un punto rojo en el botón indica errores; uno naranja, algo pendiente (dominio vacío o una
   variable sin asignar).
2. **Fórmula** (abajo): usa la barra de símbolos o el teclado (`->` →, `&` ∧, `|` ∨, `~` ¬,
   `\A` ∀, `\E` ∃). Los errores se subrayan mientras escribes y se muestra cómo se interpretó.
   Se acepta la notación de las presentaciones, con la variable pegada al predicado
   (`∃xQ(x)`, `∃x∀yP(x, y)`). Precedencia: `¬ ∀ ∃` > `∧` > `∨` > `→` (asociativa a derecha);
   un cuantificador solo alcanza la fórmula que le sigue, así que `∀x P(x) → Q(x)` se lee
   `(∀x P(x)) → Q(x)` y se muestra así.
3. **Evaluar** (o Ctrl + Enter): muestra Verdadero o Falso en la notación del curso. **Ver
   justificación** abre el árbol completo con testigos, contraejemplos o comprobación completa.
4. **Animación**: al evaluar empieza a reproducirse. El panel derecho narra cada paso, resalta
   la parte de la fórmula que se evalúa y lleva un marcador por cuantificador (∀: todos deben
   cumplir; ∃: basta con uno). Los controles permiten pausar, avanzar paso a paso, cambiar la
   velocidad y elegir el recorrido:
   - **Como una persona**: se detiene en cuanto el resultado queda decidido (por ejemplo, al
     hallar un testigo); lo que ya no hace falta revisar aparece tachado.
   - **Todo**: todo lo que calculó el evaluador.
   - **Solo lo decisivo**: solo las razones que deciden el resultado.

   **Ver en notación formal** muestra cada paso con la notación del curso.

El proyecto se guarda automáticamente en el navegador. El menú **Proyecto** permite descargarlo
o cargarlo como JSON y empezar uno nuevo, y **Ejemplos del curso** carga los ejemplos de las
presentaciones.

## Dictado por voz

El botón **Dictar** (o Ctrl + M) permite decir la fórmula en español en lugar de escribirla.
Funciona en Chrome y Edge, que traen reconocimiento de voz; en estos navegadores el
reconocimiento suele necesitar conexión a internet. En otros navegadores el botón aparece
deshabilitado.

Mientras hablas, la transcripción se colorea según cómo se entendió cada palabra y debajo se
arma la fórmula. Al terminar, **Insertar fórmula** (o decir «listo») la pone en el editor:
reemplaza la fórmula, o solo el fragmento seleccionado si había uno. **Deshacer** la quita.

| Se dice | Se escribe |
|---------|-----------|
| para todo, para cada | ∀ |
| existe, hay un | ∃ |
| no | ¬ |
| no es cierto que … | ¬( … ) hasta el final |
| y / o | ∧ / ∨ |
| implica, entonces, si … entonces | → |
| es igual a / es distinto de | = / ≠ |
| P de x coma y | P(x, y) |
| abre / cierra paréntesis | ( ) |
| tal que, o una pausa después de la variable | el cuantificador alcanza hasta el final |

Las letras se pueden decir por su nombre («equis», «i griega», «pe», «erre»). «y» es la
variable y cuando va donde se espera un término y el conectivo ∧ cuando va entre fórmulas; los
argumentos se leen según la aridad declarada, así que «R de x y y» es `R(x, y)`.

Las mayúsculas no importan: «p» y «pe» se reconocen como el predicado `P`. Para fijarlas se
dice «mayúscula» o «minúscula» después de la letra: «pe minúscula de x» es `p(x)`, «equis
mayúscula» es la constante `X` (sin la palabra, «x» es la variable). Si el lenguaje tiene dos
símbolos que se dicen igual, como `p` y `P`, la aplicación pide distinguirlos en vez de adivinar. Si dices un símbolo
que el lenguaje no tiene, el mensaje dice qué símbolos sí existen (y cuál se parece) y ofrece
**declararlo** con el tipo y la aridad que se deducen de lo dictado: «q de x» propone el
predicado `Q` de aridad 1. Si faltan varios, se proponen uno tras otro. Después hay que definir
su interpretación.

Comandos: «borra eso», «borra todo», «listo», «evaluar», «cancelar» y «declara».

**Lectura en voz alta**: la aplicación puede leer lo que entendió antes de insertarlo, el
veredicto (**Escuchar** junto al resultado) y cada paso de la animación (**Narrar en voz alta**;
la animación espera a que termine de hablar).

La voz se elige en **Voz** (barra superior), junto con la velocidad, y se puede probar ahí mismo.
Por defecto se usa la más natural disponible: las voces «Natural» de Microsoft en Edge y las de
Google en Chrome (estas necesitan internet). eSpeak, la voz local habitual en Linux, suena
robótica y solo se usa si no hay otra.

La traducción la hace el backend con un parser de la misma gramática que el escrito. Su inverso,
el verbalizador, convierte cada fórmula en la frase que la dicta; las pruebas verifican con
fórmulas aleatorias que `traducir(verbalizar(φ)) = φ`.

## Vistas 3D

El selector **Universo | Máquina** de la barra superior cambia la vista. La aplicación abre en
la máquina (o en el universo, mientras no haya una fórmula válida).

**Máquina**: la fórmula es una máquina con una pieza por subfórmula. Los valores de las
variables viajan por los cables hasta los sensores y los resultados V/F regresan hasta la
salida; cada pieza tiene una lámpara que late mientras trabaja y queda en V o F.

| Subfórmula | Pieza | Qué hace |
|------------|-------|----------|
| `∀x φ`, `∃x φ` | Engranaje con un aro de cuentas | Prueba cada elemento de 𝒟 (las cuentas se encienden en verde o rojo); ∀ necesita que todos den V, ∃ que uno dé V |
| `¬φ`, `φ ∧ ψ`, `φ ∨ ψ` | Compuerta lógica | Combina los resultados de sus entradas |
| `φ → ψ` | Compuerta O con burbuja de negación en la entrada A | Dibuja la equivalencia `φ → ψ ≡ ¬φ ∨ ψ` |
| `t₁ = t₂` | Balanza | Queda equilibrada si los dos valores son el mismo elemento |
| `P(t₁, …, tₙ)` | Terminal | Muestra la consulta a la interpretación, p. ej. `R(1, 2) ? No` |

Según el espacio libre, la máquina se dibuja vertical (la salida arriba) u horizontal (como una
línea de producción, con la entrada a la izquierda).

**Universo**: la interpretación. Cada elemento de 𝒟 es una esfera; los predicados unarios son
anillos de color alrededor de los elementos que los cumplen y los binarios, flechas
(`a → b` significa `(a, b) ∈ Rᴵ`). Las constantes aparecen bajo su elemento. Durante la
animación, las etiquetas de las variables se deslizan hacia el elemento que les asigna el
entorno, la flecha que se comprueba se ilumina y los elementos ya revisados llevan ✓ o ✗. Con
un clic sobre un elemento se ven sus datos (constantes, predicados, pares y valores de las
funciones unarias). Los predicados de aridad ≥ 3 y las funciones no se dibujan; el universo se
dibuja hasta con 40 elementos.

Con *prefers-reduced-motion* activado no hay animaciones: cada paso aparece en su estado final.
La escena necesita WebGL; sin él, la evaluación y la justificación funcionan igual.

### Sonido

La evaluación también se oye. En la máquina, el paquete que baja, la compuerta que procesa y el
sensor que consulta tienen cada uno su sonido. En el universo suenan la variable que se desliza
y la flecha que existe o no existe. En las dos vistas, cada elemento que prueba un cuantificador
suena como una cuenta (cristal si cumple, madera si no), un poco más aguda cada vez. El testigo,
el contraejemplo y el veredicto final tienen sonidos propios. Mientras la máquina trabaja suenan
de fondo sus engranajes.

Los efectos están en `frontend/src/assets/sounds/` (WAV). Cerrar una ventana usa el sonido de
abrirla tocado al revés, y elegir un elemento del universo se sintetiza con Web Audio. El botón 🔊/🔇 de la barra los silencia y la preferencia
se guarda en el navegador. El navegador no deja sonar nada hasta el primer clic o tecla.

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
| POST | `/api/speech/translate` | Traduce una transcripción en español hablado a una fórmula |
| POST | `/api/speech/command` | Reconoce comandos de voz («borra eso», «listo», …) |

Si la entrada tiene errores, `/api/evaluate` responde `ok: false` con los diagnósticos y
**sin** valor de verdad.

En la explicación, cada fórmula atómica trae `atom`: el símbolo comprobado (el predicado o `=`)
y los valores de sus argumentos en 𝒟, por ejemplo `{"symbol": "R", "args": ["1", "3"]}`. Lo usa
la animación para saber qué flecha, anillo o balanza resaltar sin interpretar el texto de
`reason`.

### Juego de Hintikka

Después de evaluar, **Jugar** (junto a «Ver justificación») abre el juego semántico: eliges ser
Verificador (quieres mostrar que la fórmula es verdadera) o Falsificador, y juegas contra la
máquina, que usa la estrategia ganadora. En cada turno se eligen testigos, contraejemplos o una
parte de la fórmula; una negación intercambia los papeles. Al final se explica quién gana y por
qué, y si perdiste una estrategia ganadora se marca la jugada en que ocurrió. El Verificador
tiene estrategia ganadora si y solo si ℐ ⊨ φ.

Lo que sigue describe la API del juego.

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

En Windows, la consola usa por defecto otra codificación y el esquema tiene símbolos como 𝒟;
para exportarlo:

```bash
cd backend/src && PYTHONUTF8=1 ../.venv/Scripts/python -m evaluador.api.openapi_export > ../../frontend/src/api/openapi.json
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

La lógica de las vistas está separada del dibujo y tiene sus propias pruebas:
`lib/universe.ts` (recorrido y marcador de cuantificadores), `lib/narration.ts` (narración) y
`lib/machine.ts` (piezas de la máquina y su estado en cada paso) y `lib/stepSounds.ts` (qué
suena en cada paso).

## Producción

```bash
cd frontend && pnpm build
cd ../backend && fastapi run src/evaluador/api/main.py
```

El backend sirve el build del frontend desde la misma URL.

## Referencias

El proyecto se desarrolló con apoyo de un asistente de programación (Anthropic, 2026).

Anthropic. (2026). *Claude Code* (versión 2.1.326, modelo Claude Opus 5.5) [Asistente de
programación basado en un modelo de lenguaje de gran tamaño]. https://www.anthropic.com/claude-code
