"""Esquemas JSON de la API (Pydantic).

Solo describen la forma de los datos; las reglas lógicas se validan en el núcleo
para que los mensajes de error sean los del evaluador, en español.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ------------------------------------------------------------------ entrada


class SymbolDeclIn(BaseModel):
    name: str
    arity: int


class LanguageIn(BaseModel):
    constants: list[str] = Field(default_factory=list)
    functions: list[SymbolDeclIn] = Field(default_factory=list)
    predicates: list[SymbolDeclIn] = Field(default_factory=list)


class FunctionRowIn(BaseModel):
    args: list[str]
    value: str


class InterpretationIn(BaseModel):
    domain: list[str] = Field(default_factory=list)
    constants: dict[str, str] = Field(default_factory=dict)
    functions: dict[str, list[FunctionRowIn]] = Field(default_factory=dict)
    predicates: dict[str, list[list[str]]] = Field(default_factory=dict)


class FormulaIn(BaseModel):
    language: LanguageIn
    formula: str


class InterpretationRequest(BaseModel):
    language: LanguageIn
    interpretation: InterpretationIn


class ProjectIn(BaseModel):
    """Proyecto completo: también es el formato para guardar y cargar."""

    version: int = 1
    language: LanguageIn = Field(default_factory=LanguageIn)
    interpretation: InterpretationIn = Field(default_factory=InterpretationIn)
    formula: str = ""
    environment: dict[str, str] = Field(default_factory=dict)


GameRole = Literal["verificador", "falsificador"]
GamePlayer = Literal["usuario", "máquina"]


class GameStartIn(BaseModel):
    project: ProjectIn
    user_role: GameRole


class GameStateIn(BaseModel):
    """Posición del juego. El servidor no guarda partidas: el cliente reenvía el estado completo."""

    project: ProjectIn
    start: int
    end: int
    environment: dict[str, str]
    env_label: str
    user_role: GameRole


class GameMoveIn(BaseModel):
    """Sin `move` juega la máquina."""

    state: GameStateIn
    move: str | None = None


# ------------------------------------------------------------------ salida


class OutModel(BaseModel):
    """Respuestas: los campos con valor por defecto siempre se envían."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class LocationOut(OutModel):
    kind: str
    start: int | None = None
    end: int | None = None
    path: list[str | int] = Field(default_factory=list)


class DiagnosticOut(OutModel):
    code: str
    severity: Literal["error", "warning"]
    message: str
    location: LocationOut


class DiagnosticsOut(OutModel):
    ok: bool
    diagnostics: list[DiagnosticOut]


class OccurrenceOut(OutModel):
    name: str
    start: int
    end: int
    free: bool
    binder_start: int | None = None
    binder_end: int | None = None


SyntaxKind = Literal[
    "var", "const", "func", "eq", "pred", "not", "and", "or", "implies", "forall", "exists"
]


class SyntaxNodeOut(OutModel):
    """Nodo del árbol sintáctico (fórmulas y términos), como en las presentaciones."""

    id: str
    kind: SyntaxKind
    label: str  # símbolo del nodo: "∀x", "∧", "P", "f", "x", "="
    text: str  # subfórmula o subtérmino completo
    start: int
    end: int
    children: list["SyntaxNodeOut"] = Field(default_factory=list)


class FormulaAnalysisOut(OutModel):
    ok: bool
    diagnostics: list[DiagnosticOut]
    parenthesized: str | None = None
    free_vars: list[str] = Field(default_factory=list)
    occurrences: list[OccurrenceOut] = Field(default_factory=list)
    syntax_tree: SyntaxNodeOut | None = None


class BindingOut(OutModel):
    var: str
    value: str


Rule = Literal[
    "predicado",
    "igualdad",
    "negación",
    "conjunción",
    "disyunción",
    "implicación",
    "universal",
    "existencial",
]
JustificationOut = Literal["testigo", "contraejemplo", "comprobación completa"]


class AtomOut(OutModel):
    """Fórmula atómica ya calculada: `symbol` es el predicado o "=", `args` sus valores en 𝒟."""

    symbol: str
    args: list[str]


class ExplainNodeOut(OutModel):
    id: str
    formula: str
    start: int
    end: int
    env_label: str
    env: list[BindingOut]
    value: bool
    rule: Rule
    reason: str
    decisive: bool
    justification: JustificationOut | None = None
    binding: BindingOut | None = None
    computations: list[str] = Field(default_factory=list)
    atom: AtomOut | None = None
    pruned: bool = False
    children: list["ExplainNodeOut"] = Field(default_factory=list)


class EvaluationOut(OutModel):
    """Si `ok` es falso, `value`, `summary` y `explanation` vienen vacíos."""

    ok: bool
    diagnostics: list[DiagnosticOut]
    value: bool | None = None
    summary: str | None = None
    explanation: ExplainNodeOut | None = None
    truncated: bool = False
    node_count: int = 0
    free_vars: list[str] = Field(default_factory=list)
    parenthesized: str | None = None


class ExampleOut(OutModel):
    id: str
    title: str
    description: str
    project: ProjectIn


class HealthOut(OutModel):
    status: str
    version: str


class GameOptionOut(OutModel):
    move: str
    label: str  # "P(x)", "¬P(x)" o "x ↦ a"


class GameStateOut(OutModel):
    project: ProjectIn
    start: int
    end: int
    environment: dict[str, str]
    env_label: str
    user_role: GameRole
    formula: str
    turn: GamePlayer | None = None
    options: list[GameOptionOut] = Field(default_factory=list)


class GameMoveOut(OutModel):
    state: GameStateOut
    machine_move: str | None = None
    finished: bool
    winner: GamePlayer | None = None
    commentary: str
    mistake: bool = False
