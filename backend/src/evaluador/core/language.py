"""Lenguaje de primer orden configurable (símbolos no lógicos).

ℒ tiene constantes (𝒞), símbolos funcionales n-arios (ℱ) y predicados n-arios (ℛ).
Los símbolos lógicos (¬ ∧ ∨ → ∀ ∃ = y paréntesis) son fijos y no se declaran.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from evaluador.core.errors import Diagnostic, Location
from evaluador.core.lexer import IDENTIFIER_PATTERN, KEYWORDS, is_variable_name


class SymbolKind(StrEnum):
    CONSTANT = "constante"
    FUNCTION = "símbolo funcional"
    PREDICATE = "predicado"


@dataclass(frozen=True, slots=True)
class SymbolDecl:
    name: str
    arity: int


@dataclass(frozen=True, slots=True)
class Signature:
    """Signatura ya validada: nombres únicos y aridades ≥ 1."""

    constants: frozenset[str]
    functions: dict[str, int]
    predicates: dict[str, int]

    def kind_of(self, name: str) -> SymbolKind | None:
        if name in self.constants:
            return SymbolKind.CONSTANT
        if name in self.functions:
            return SymbolKind.FUNCTION
        if name in self.predicates:
            return SymbolKind.PREDICATE
        return None


@dataclass(frozen=True, slots=True)
class SignatureResult:
    signature: Signature | None
    diagnostics: list[Diagnostic]


def build_signature(
    constants: Sequence[str],
    functions: Sequence[SymbolDecl],
    predicates: Sequence[SymbolDecl],
) -> SignatureResult:
    """Valida las declaraciones y construye la signatura.

    Devuelve `signature=None` si hay algún error.
    """
    diagnostics: list[Diagnostic] = []
    seen: dict[str, SymbolKind] = {}

    def register(name: str, kind: SymbolKind, index: int) -> None:
        location = Location("language", path=(kind.value, index))
        problem = _name_problem(name)
        if problem is not None:
            diagnostics.append(
                Diagnostic("E-LNG-001", f"Nombre inválido '{name}': {problem}", location)
            )
            return
        if name in seen:
            diagnostics.append(
                Diagnostic(
                    "E-LNG-002",
                    f"El nombre '{name}' ya está declarado como {seen[name].value}.",
                    location,
                )
            )
            return
        seen[name] = kind

    def check_arity(decl: SymbolDecl, kind: SymbolKind, index: int) -> None:
        if isinstance(decl.arity, bool) or not isinstance(decl.arity, int) or decl.arity < 1:
            diagnostics.append(
                Diagnostic(
                    "E-LNG-003",
                    f"La aridad de '{decl.name}' debe ser un entero mayor o igual a 1.",
                    Location("language", path=(kind.value, index)),
                )
            )

    for i, name in enumerate(constants):
        register(name, SymbolKind.CONSTANT, i)
    for i, decl in enumerate(functions):
        register(decl.name, SymbolKind.FUNCTION, i)
        check_arity(decl, SymbolKind.FUNCTION, i)
    for i, decl in enumerate(predicates):
        register(decl.name, SymbolKind.PREDICATE, i)
        check_arity(decl, SymbolKind.PREDICATE, i)

    if diagnostics:
        return SignatureResult(None, diagnostics)
    signature = Signature(
        constants=frozenset(constants),
        functions={d.name: d.arity for d in functions},
        predicates={d.name: d.arity for d in predicates},
    )
    return SignatureResult(signature, [])


def _name_problem(name: str) -> str | None:
    if is_variable_name(name):
        return "está reservado para variables (u, v, w, x, y, z con dígitos opcionales)."
    if name in KEYWORDS:
        return "es una palabra reservada."
    if IDENTIFIER_PATTERN.fullmatch(name) is None:
        return "debe empezar con una letra y contener solo letras, dígitos o '_'."
    return None
