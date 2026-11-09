"""Diagnósticos: errores y advertencias reportados al usuario.

Los errores del usuario se devuelven como datos (listas de `Diagnostic`), no como
excepciones. Las excepciones quedan para errores de programación.
"""

from dataclasses import dataclass
from enum import StrEnum


class Severity(StrEnum):
    ERROR = "error"
    WARNING = "warning"


@dataclass(frozen=True, slots=True)
class Span:
    """Intervalo [start, end) de caracteres en el texto de la fórmula."""

    start: int
    end: int

    def merge(self, other: "Span") -> "Span":
        return Span(min(self.start, other.start), max(self.end, other.end))


@dataclass(frozen=True, slots=True)
class Location:
    """Dónde ocurrió el problema.

    `kind` indica la sección de la entrada ("formula", "language", "domain",
    "constant", "function", "predicate", "environment"). Para fórmulas se usa
    `span`; para tablas y listas se usa `path` (p. ej. ("f", "a", "b")).
    """

    kind: str
    span: Span | None = None
    path: tuple[str | int, ...] = ()


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: str
    message: str
    location: Location
    severity: Severity = Severity.ERROR

    @property
    def is_error(self) -> bool:
        return self.severity is Severity.ERROR


class DiagnosticError(Exception):
    """Excepción interna para cortar el análisis sintáctico en el primer error."""

    def __init__(self, diagnostic: Diagnostic) -> None:
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic


def has_errors(diagnostics: list[Diagnostic]) -> bool:
    return any(d.is_error for d in diagnostics)
