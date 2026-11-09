"""Semántica de Tarski: valor de términos y verdad de fórmulas (slides 11).

Esta es la definición del curso traducida casi literalmente, sin explicaciones.
`explain.py` construye el árbol de justificación y se prueba que siempre
coincide con `satisfies`.

Supone entradas ya validadas (símbolos declarados, aridades correctas,
interpretación total y entorno definido en las variables libres).
"""

from evaluador.core.environment import Environment
from evaluador.core.interpretation import Element, Interpretation
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


def eval_term(term: Term, interp: Interpretation, env: Environment) -> Element:
    match term:
        case Var(name):
            # ⟦x⟧ₗ = l(x)
            return env(name)
        case Const(name):
            # ⟦c⟧ₗ = cᴵ
            return interp.constants[name]
        case Func(name, args):
            # ⟦f(t₁, …, tₙ)⟧ₗ = fᴵ(⟦t₁⟧ₗ, …, ⟦tₙ⟧ₗ)
            values = tuple(eval_term(arg, interp, env) for arg in args)
            return interp.functions[name][values]


def satisfies(formula: Formula, interp: Interpretation, env: Environment) -> bool:
    """ℐ ⊨ₗ φ"""
    match formula:
        case Eq(left, right):
            # ℐ ⊨ₗ t₁ = t₂  sii  ⟦t₁⟧ₗ y ⟦t₂⟧ₗ son el mismo elemento de 𝒟
            return eval_term(left, interp, env) == eval_term(right, interp, env)
        case Pred(name, args):
            # ℐ ⊨ₗ P(t₁, …, tₙ)  sii  (⟦t₁⟧ₗ, …, ⟦tₙ⟧ₗ) ∈ Pᴵ
            values = tuple(eval_term(arg, interp, env) for arg in args)
            return values in interp.predicates[name]
        case Not(body):
            # ℐ ⊨ₗ ¬φ  sii  no es el caso que ℐ ⊨ₗ φ
            return not satisfies(body, interp, env)
        case And(left, right):
            # ℐ ⊨ₗ φ ∧ ψ  sii  ℐ ⊨ₗ φ y ℐ ⊨ₗ ψ
            return satisfies(left, interp, env) and satisfies(right, interp, env)
        case Or(left, right):
            # ℐ ⊨ₗ φ ∨ ψ  sii  ℐ ⊨ₗ φ o ℐ ⊨ₗ ψ
            return satisfies(left, interp, env) or satisfies(right, interp, env)
        case Implies(left, right):
            # ℐ ⊨ₗ φ → ψ  sii  ℐ ⊨ₗ ψ siempre que ℐ ⊨ₗ φ
            return not satisfies(left, interp, env) or satisfies(right, interp, env)
        case ForAll(var, body):
            # ℐ ⊨ₗ ∀x φ  sii  ℐ ⊨_{l[x↦a]} φ para toda a ∈ 𝒟
            return all(satisfies(body, interp, env.update(var, a)) for a in interp.domain)
        case Exists(var, body):
            # ℐ ⊨ₗ ∃x φ  sii  ℐ ⊨_{l[x↦a]} φ para alguna a ∈ 𝒟
            return any(satisfies(body, interp, env.update(var, a)) for a in interp.domain)
