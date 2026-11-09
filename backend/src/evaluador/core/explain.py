"""Árbol de justificación de ℐ ⊨ₗ φ con las razones decisivas.

Cada nodo corresponde a una cláusula de la definición de verdad. Se evalúan
todos los hijos (para el árbol visual y el juego) y se marcan como decisivos los
que justifican el resultado:

- ∃x φ verdadera: testigo (primer a ∈ 𝒟 con ℐ ⊨_{l[x↦a]} φ).
- ∀x φ falsa: contraejemplo (primer a ∈ 𝒟 con ℐ ⊭_{l[x↦a]} φ).
- ∀x φ verdadera o ∃x φ falsa: comprobación completa (todos los a ∈ 𝒟).

"Primer" se refiere al orden en que el usuario ingresó 𝒟, así el resultado es
determinista.
"""

import itertools
from dataclasses import dataclass, replace
from enum import StrEnum

from evaluador.core.environment import Environment
from evaluador.core.freevars import ordered_free_vars
from evaluador.core.interpretation import Element, Interpretation
from evaluador.core.printer import format_formula, format_term
from evaluador.core.semantics import eval_term, satisfies
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

DEFAULT_NODE_BUDGET = 200_000


class Rule(StrEnum):
    ATOM_PRED = "predicado"
    ATOM_EQ = "igualdad"
    NOT = "negación"
    AND = "conjunción"
    OR = "disyunción"
    IMPLIES = "implicación"
    FORALL = "universal"
    EXISTS = "existencial"


class Justification(StrEnum):
    WITNESS = "testigo"
    COUNTEREXAMPLE = "contraejemplo"
    FULL_CHECK = "comprobación completa"


@dataclass(frozen=True, slots=True)
class ExplainNode:
    formula: Formula
    env_label: str  # l, l[x↦a], …
    env: tuple[tuple[str, Element], ...]  # valores de las variables libres del nodo
    value: bool
    rule: Rule
    reason: str
    children: tuple["ExplainNode", ...] = ()
    decisive: bool = True  # lo fija el padre; la raíz siempre es decisiva
    justification: Justification | None = None  # solo en cuantificadores
    binding: tuple[str, Element] | None = None  # en hijos de cuantificador: (x, a)
    computations: tuple[str, ...] = ()  # cálculo de términos en atómicas
    pruned: bool = False  # hijos omitidos por superar el presupuesto de nodos

    @property
    def decisive_children(self) -> tuple["ExplainNode", ...]:
        return tuple(child for child in self.children if child.decisive)


@dataclass(frozen=True, slots=True)
class Explanation:
    root: ExplainNode
    summary: str
    truncated: bool
    node_count: int


def explain(
    formula: Formula,
    interp: Interpretation,
    env: Environment,
    *,
    node_budget: int = DEFAULT_NODE_BUDGET,
) -> Explanation:
    explainer = _Explainer(interp, node_budget)
    root = explainer.node(formula, env)
    return Explanation(root, summarize(root), explainer.truncated, explainer.count)


# ------------------------------------------------------------------ notación


def sat(label: str, formula: Formula, value: bool) -> str:
    """ℐ ⊨_{l} φ  o  ℐ ⊭_{l} φ"""
    symbol = "⊨" if value else "⊭"
    return f"ℐ {symbol}_{{{label}}} {format_formula(formula)}"


def _tuple(values: tuple[Element, ...]) -> str:
    return values[0] if len(values) == 1 else f"({', '.join(values)})"


def _set(values: tuple[Element, ...]) -> str:
    return "{" + ", ".join(values) + "}"


# ------------------------------------------------------------------ construcción


class _Explainer:
    def __init__(self, interp: Interpretation, budget: int) -> None:
        self.interp = interp
        self.budget = budget
        self.count = 0
        self.truncated = False

    def node(
        self, formula: Formula, env: Environment, binding: tuple[str, Element] | None = None
    ) -> ExplainNode:
        self.count += 1
        relevant = env.restricted_to(ordered_free_vars(formula))
        if self.count > self.budget and not isinstance(formula, Eq | Pred):
            self.truncated = True
            value = satisfies(formula, self.interp, env)
            return ExplainNode(
                formula,
                env.label,
                relevant,
                value,
                _rule_of(formula),
                f"{sat(env.label, formula, value)} (detalle omitido: la explicación es "
                "demasiado grande).",
                binding=binding,
                pruned=True,
            )
        node = self.build(formula, env)
        return replace(node, env=relevant, binding=binding)

    def build(self, formula: Formula, env: Environment) -> ExplainNode:
        label = env.label
        match formula:
            case Pred(name, args):
                computations: list[str] = []
                values = tuple(self.trace(arg, env, computations) for arg in args)
                value = values in self.interp.predicates[name]
                belongs = "∈" if value else "∉"
                conclusion = sat(label, formula, value)
                reason = f"{_tuple(values)} {belongs} {name}ᴵ, por lo tanto {conclusion}."
                return ExplainNode(
                    formula, label, (), value, Rule.ATOM_PRED, reason,
                    computations=tuple(computations),
                )  # fmt: skip

            case Eq(left, right):
                computations = []
                a = self.trace(left, env, computations)
                b = self.trace(right, env, computations)
                value = a == b
                relation = f"{a} = {b}" if value else f"{a} ≠ {b}"
                reason = f"{relation}, por lo tanto {sat(label, formula, value)}."
                return ExplainNode(
                    formula, label, (), value, Rule.ATOM_EQ, reason,
                    computations=tuple(computations),
                )  # fmt: skip

            case Not(body):
                child = self.node(body, env)
                value = not child.value
                reason = (
                    f"{sat(label, body, child.value)}, por lo tanto {sat(label, formula, value)}."
                )
                return ExplainNode(formula, label, (), value, Rule.NOT, reason, (child,))

            case And(left, right):
                lhs, rhs = self.node(left, env), self.node(right, env)
                value = lhs.value and rhs.value
                if value:
                    decisive = (True, True)
                    why = "ambos conyuntos son verdaderos"
                elif not lhs.value:
                    decisive = (True, False)
                    why = "el conyunto izquierdo es falso"
                else:
                    decisive = (False, True)
                    why = "el conyunto derecho es falso"
                return self.binary(formula, label, value, Rule.AND, why, lhs, rhs, decisive)

            case Or(left, right):
                lhs, rhs = self.node(left, env), self.node(right, env)
                value = lhs.value or rhs.value
                if not value:
                    decisive = (True, True)
                    why = "ambos disyuntos son falsos"
                elif lhs.value:
                    decisive = (True, False)
                    why = "el disyunto izquierdo es verdadero"
                else:
                    decisive = (False, True)
                    why = "el disyunto derecho es verdadero"
                return self.binary(formula, label, value, Rule.OR, why, lhs, rhs, decisive)

            case Implies(left, right):
                lhs, rhs = self.node(left, env), self.node(right, env)
                value = not lhs.value or rhs.value
                if not lhs.value:
                    decisive = (True, False)
                    why = "el antecedente es falso"
                elif rhs.value:
                    decisive = (False, True)
                    why = "el consecuente es verdadero"
                else:
                    decisive = (True, True)
                    why = "el antecedente es verdadero y el consecuente es falso"
                return self.binary(formula, label, value, Rule.IMPLIES, why, lhs, rhs, decisive)

            case ForAll(var, body) | Exists(var, body):
                return self.quantifier(formula, var, body, env)

    def binary(
        self,
        formula: Formula,
        label: str,
        value: bool,
        rule: Rule,
        why: str,
        lhs: ExplainNode,
        rhs: ExplainNode,
        decisive: tuple[bool, bool],
    ) -> ExplainNode:
        reasons = [
            sat(c.env_label, c.formula, c.value)
            for c, d in zip((lhs, rhs), decisive, strict=True)
            if d
        ]
        reason = f"{' y '.join(reasons)}: {why}, por lo tanto {sat(label, formula, value)}."
        children = (replace(lhs, decisive=decisive[0]), replace(rhs, decisive=decisive[1]))
        return ExplainNode(formula, label, (), value, rule, reason, children)

    def quantifier(
        self, formula: Formula, var: str, body: Formula, env: Environment
    ) -> ExplainNode:
        is_forall = isinstance(formula, ForAll)
        rule = Rule.FORALL if is_forall else Rule.EXISTS
        children = [self.node(body, env.update(var, a), (var, a)) for a in self.interp.domain]
        label = env.label
        domain = _set(self.interp.domain)
        n = len(children)
        cases = "1 caso" if n == 1 else f"{n} casos"

        # Para ∀ se busca un hijo falso (contraejemplo); para ∃, uno verdadero (testigo).
        target = not is_forall
        found = next((c for c in children if c.value == target), None)

        if found is None:
            value = is_forall
            reason = (
                f"Comprobación completa: {sat(f'{label}[{var}↦𝑎]', body, value)} para cada "
                f"𝑎 ∈ 𝒟 = {domain} ({cases}), por lo tanto {sat(label, formula, value)}."
            )
            marked = tuple(replace(c, decisive=True) for c in children)
            return ExplainNode(
                formula, label, (), value, rule, reason, marked,
                justification=Justification.FULL_CHECK,
            )  # fmt: skip

        value = not is_forall
        assert found.binding is not None
        element = found.binding[1]
        kind = Justification.COUNTEREXAMPLE if is_forall else Justification.WITNESS
        title = "Contraejemplo" if is_forall else "Testigo"
        reason = (
            f"{title}: {var} ↦ {element}. {sat(found.env_label, body, found.value)}, "
            f"por lo tanto {sat(label, formula, value)}."
        )
        marked = tuple(replace(c, decisive=c is found) for c in children)
        return ExplainNode(formula, label, (), value, rule, reason, marked, justification=kind)

    def trace(self, term: Term, env: Environment, out: list[str]) -> Element:
        """Evalúa `term` y anota cada paso del cálculo: ⟦t⟧_{l} = …"""
        label = env.label
        match term:
            case Var(name):
                value = env(name)
                step = f"⟦{name}⟧_{{{label}}} = {label}({name}) = {value}"
            case Const(name):
                value = self.interp.constants[name]
                step = f"⟦{name}⟧_{{{label}}} = {name}ᴵ = {value}"
            case Func(name, args):
                values = tuple(self.trace(arg, env, out) for arg in args)
                value = self.interp.functions[name][values]
                step = f"⟦{format_term(term)}⟧_{{{label}}} = {name}ᴵ({', '.join(values)}) = {value}"
        assert value == eval_term(term, self.interp, env)
        if step not in out:
            out.append(step)
        return value


def _rule_of(formula: Formula) -> Rule:
    match formula:
        case Pred():
            return Rule.ATOM_PRED
        case Eq():
            return Rule.ATOM_EQ
        case Not():
            return Rule.NOT
        case And():
            return Rule.AND
        case Or():
            return Rule.OR
        case Implies():
            return Rule.IMPLIES
        case ForAll():
            return Rule.FORALL
        case Exists():
            return Rule.EXISTS


# ------------------------------------------------------------------ resumen


def summarize(root: ExplainNode) -> str:
    """Resumen en una línea: valor, testigos/contraejemplos de la ruta decisiva y razón final.

    La ruta decisiva se sigue mientras cada nodo tenga un único hijo decisivo.
    """
    verdict = "Verdadero" if root.value else "Falso"
    path = [root]
    while len(path[-1].decisive_children) == 1:
        path.append(path[-1].decisive_children[0])

    choices = [
        (parent.justification, child.binding)
        for parent, child in itertools.pairwise(path)
        if parent.justification in (Justification.WITNESS, Justification.COUNTEREXAMPLE)
        and child.binding is not None
    ]
    if not choices:
        return f"{verdict}. {root.reason}"

    kinds = {kind for kind, _ in choices}
    if kinds == {Justification.WITNESS}:
        title = "testigo"
    elif kinds == {Justification.COUNTEREXAMPLE}:
        title = "contraejemplo"
    else:
        title = "elecciones decisivas"
    steps = ", ".join(f"{var} ↦ {element}" for _, (var, element) in choices)
    root_text = sat(root.env_label, root.formula, root.value)
    return f"{verdict}. {root_text}; {title}: {steps}. {path[-1].reason}"
