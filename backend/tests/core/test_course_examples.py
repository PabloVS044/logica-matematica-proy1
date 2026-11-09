"""Ejemplos de las presentaciones del curso con su respuesta (verificada a mano).

Slides 10 (Interpretaciones) y 11 (Entornos).
"""

import pytest

from evaluador.core.environment import Environment
from evaluador.core.explain import Justification, explain
from evaluador.core.interpretation import Interpretation
from evaluador.core.parser import parse
from evaluador.core.semantics import satisfies

# Slides 10: 𝒟 = {1, 2, 3}, Pᴵ = {1, 2}, Rᴵ = {(1, 3), (2, 1), (3, 2)}
NUMBERS = Interpretation(
    domain=("1", "2", "3"),
    constants={},
    functions={},
    predicates={
        "P": frozenset({("1",), ("2",)}),
        "R": frozenset({("1", "3"), ("2", "1"), ("3", "2")}),
    },
)

# Slides 10: 𝒟 = {a, b, c}, iᴵ = a, Rᴵ = {b, c}, Qᴵ = {(a,a), (a,b), (a,c), (b,c), (c,c)}
LETTERS = Interpretation(
    domain=("a", "b", "c"),
    constants={"i": "a"},
    functions={},
    predicates={
        "R": frozenset({("b",), ("c",)}),
        "Q": frozenset({("a", "a"), ("a", "b"), ("a", "c"), ("b", "c"), ("c", "c")}),
    },
)

# Slides 11: 𝒟 = {0, 1, 2}, Pᴵ = {(0, 1), (0, 2), (1, 2)}
ORDER = Interpretation(
    domain=("0", "1", "2"),
    constants={},
    functions={},
    predicates={"P": frozenset({("0", "1"), ("0", "2"), ("1", "2")})},
)


def bindings_on_decisive_path(text: str, interp: Interpretation) -> list[tuple[str, str]]:
    node = explain(parse(text), interp, Environment()).root
    result = []
    while len(node.decisive_children) == 1:
        node = node.decisive_children[0]
        if node.binding is not None:
            result.append(node.binding)
    return result


@pytest.mark.parametrize(
    ("interp", "text", "expected", "justification", "path"),
    [
        (NUMBERS, "∀x P(x)", False, Justification.COUNTEREXAMPLE, [("x", "3")]),
        (NUMBERS, "∀x ∃y R(x, y)", True, Justification.FULL_CHECK, []),
        (
            NUMBERS,
            "∀x ∀y (P(x) → R(x, y))",
            False,
            Justification.COUNTEREXAMPLE,
            [("x", "1"), ("y", "1")],
        ),
        (LETTERS, "∃y Q(i, y)", True, Justification.WITNESS, [("y", "a")]),
        (LETTERS, "¬R(i)", True, None, []),
        (
            LETTERS,
            "∀x ∀y ∀z (Q(x, y) ∧ Q(x, z) → y = z)",
            False,
            Justification.COUNTEREXAMPLE,
            [("x", "a"), ("y", "a"), ("z", "b")],
        ),
        (LETTERS, "∀x ∃y Q(x, y)", True, Justification.FULL_CHECK, []),
        (ORDER, "∃x ∀y P(x, y)", False, Justification.FULL_CHECK, []),
    ],
)
def test_sentences(
    interp: Interpretation,
    text: str,
    expected: bool,
    justification: Justification | None,
    path: list[tuple[str, str]],
) -> None:
    formula = parse(text)
    assert satisfies(formula, interp, Environment()) is expected
    root = explain(formula, interp, Environment()).root
    assert root.value is expected
    assert root.justification is justification
    assert bindings_on_decisive_path(text, interp) == path


@pytest.mark.parametrize(
    ("x", "y", "expected"),
    [("0", "2", True), ("2", "1", False)],
)
def test_open_formula_with_environment(x: str, y: str, expected: bool) -> None:
    # Slides 11, incisos a y b: P(x, y) bajo l₁ = {x↦0, y↦2} y l₂ = {x↦2, y↦1}.
    env = Environment({"x": x, "y": y})
    assert satisfies(parse("P(x, y)"), ORDER, env) is expected


def test_exists_forall_false_checks_every_element() -> None:
    root = explain(parse("∃x ∀y P(x, y)"), ORDER, Environment()).root
    assert len(root.children) == 3
    assert all(child.decisive for child in root.children)
    # Para cada x, ∀y P(x, y) es falsa y el primer contraejemplo es y ↦ 0:
    # (0, 0), (1, 0) y (2, 0) no pertenecen a Pᴵ.
    for child in root.children:
        assert child.justification is Justification.COUNTEREXAMPLE
        assert [c.binding for c in child.children if c.decisive] == [("y", "0")]
