"""Árbol de sintaxis abstracta (AST) de términos y fórmulas de primer orden.

Términos (slides 07):
    t ::= x | c | f(t₁, …, tₙ)
Fórmulas:
    φ ::= t₁ = t₂ | P(t₁, …, tₙ) | ¬φ | φ ∧ ψ | φ ∨ ψ | φ → ψ | ∀x φ | ∃x φ

Cada nodo guarda su `span` en el texto original. El span no participa en la
igualdad: dos fórmulas son iguales si tienen la misma estructura.
"""

from dataclasses import dataclass, field

from evaluador.core.errors import Span

_NO_SPAN = Span(0, 0)


# ---------------------------------------------------------------- términos


@dataclass(frozen=True, slots=True)
class Var:
    name: str
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class Const:
    name: str
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class Func:
    name: str
    args: tuple["Term", ...]
    span: Span = field(default=_NO_SPAN, compare=False)


type Term = Var | Const | Func


# ---------------------------------------------------------------- fórmulas


@dataclass(frozen=True, slots=True)
class Eq:
    left: Term
    right: Term
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class Pred:
    name: str
    args: tuple[Term, ...]
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class Not:
    body: "Formula"
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class And:
    left: "Formula"
    right: "Formula"
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class Or:
    left: "Formula"
    right: "Formula"
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class Implies:
    left: "Formula"
    right: "Formula"
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class ForAll:
    var: str
    body: "Formula"
    span: Span = field(default=_NO_SPAN, compare=False)


@dataclass(frozen=True, slots=True)
class Exists:
    var: str
    body: "Formula"
    span: Span = field(default=_NO_SPAN, compare=False)


type Atomic = Eq | Pred
type Binary = And | Or | Implies
type Quantifier = ForAll | Exists
type Formula = Eq | Pred | Not | And | Or | Implies | ForAll | Exists
