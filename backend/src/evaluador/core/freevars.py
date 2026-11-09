"""Variables libres y ligadas (slides 08).

FV(x) = {x}        FV(c) = ∅        FV(f(t₁, …, tₙ)) = FV(t₁) ∪ … ∪ FV(tₙ)
FV(t₁ = t₂) = FV(t₁) ∪ FV(t₂)       FV(P(t₁, …, tₙ)) = FV(t₁) ∪ … ∪ FV(tₙ)
FV(¬φ) = FV(φ)     FV(φ ∘ ψ) = FV(φ) ∪ FV(ψ)   para ∘ ∈ {∧, ∨, →}
FV(∀x φ) = FV(∃x φ) = FV(φ) ∖ {x}
"""

from dataclasses import dataclass

from evaluador.core.errors import Span
from evaluador.core.syntax_tree import (
    And,
    Const,
    Eq,
    Exists,
    ForAll,
    Formula,
    Func,
    Implies,
    Not,
    Or,
    Pred,
    Term,
    Var,
)


def term_free_vars(term: Term) -> frozenset[str]:
    match term:
        case Var(name):
            return frozenset({name})
        case Const():
            return frozenset()
        case Func(_, args):
            return frozenset().union(*(term_free_vars(arg) for arg in args))


def free_vars(formula: Formula) -> frozenset[str]:
    match formula:
        case Eq(left, right):
            return term_free_vars(left) | term_free_vars(right)
        case Pred(_, args):
            return frozenset().union(*(term_free_vars(arg) for arg in args))
        case Not(body):
            return free_vars(body)
        case And(left, right) | Or(left, right) | Implies(left, right):
            return free_vars(left) | free_vars(right)
        case ForAll(var, body) | Exists(var, body):
            return free_vars(body) - {var}


def is_sentence(formula: Formula) -> bool:
    """Una fórmula es cerrada (un enunciado) si no tiene variables libres."""
    return not free_vars(formula)


@dataclass(frozen=True, slots=True)
class VarOccurrence:
    """Una aparición de variable en la fórmula.

    `binder` es el span del cuantificador que la liga (el más interno con esa
    variable), o None si la aparición es libre.
    """

    name: str
    span: Span
    binder: Span | None

    @property
    def is_free(self) -> bool:
        return self.binder is None


def occurrences(formula: Formula) -> list[VarOccurrence]:
    """Todas las apariciones de variables en orden de lectura (de izquierda a derecha)."""
    result: list[VarOccurrence] = []
    _collect(formula, {}, result)
    return result


def ordered_free_vars(formula: Formula) -> list[str]:
    """Variables libres en el orden en que aparecen por primera vez."""
    names: list[str] = []
    for occ in occurrences(formula):
        if occ.is_free and occ.name not in names:
            names.append(occ.name)
    return names


def _collect(formula: Formula, binders: dict[str, Span], out: list[VarOccurrence]) -> None:
    match formula:
        case Eq(left, right):
            _collect_term(left, binders, out)
            _collect_term(right, binders, out)
        case Pred(_, args):
            for arg in args:
                _collect_term(arg, binders, out)
        case Not(body):
            _collect(body, binders, out)
        case And(left, right) | Or(left, right) | Implies(left, right):
            _collect(left, binders, out)
            _collect(right, binders, out)
        case ForAll(var, body) | Exists(var, body):
            # El cuantificador más interno "manda": sobrescribe al externo.
            _collect(body, {**binders, var: formula.span}, out)


def _collect_term(term: Term, binders: dict[str, Span], out: list[VarOccurrence]) -> None:
    match term:
        case Var(name, span):
            out.append(VarOccurrence(name, span, binders.get(name)))
        case Const():
            pass
        case Func(_, args):
            for arg in args:
                _collect_term(arg, binders, out)
