from hypothesis import given

from evaluador.core.freevars import (
    free_vars,
    is_sentence,
    occurrences,
    ordered_free_vars,
    term_free_vars,
)
from evaluador.core.parser import parse
from evaluador.core.syntax_tree import Exists, ForAll, Formula, Func, Var

from .strategies import formulas


def test_term_free_vars() -> None:
    assert term_free_vars(Func("f", (Var("x"), Func("g", (Var("y"), Var("x")))))) == {"x", "y"}


def test_slides_08_example() -> None:
    # ∀x((P(x) → Q(x)) ∧ S(x, y)): x ligada, y libre.
    assert free_vars(parse("∀x ((P(x) → Q(x)) ∧ S(x, y))")) == {"y"}


def test_slides_08_example_a() -> None:
    # ∀x(P(x) → ∃xQ(x)): la x de P la liga ∀x y la de Q, el ∃x más interno.
    formula = parse("∀x(P(x) → ∃xQ(x))")
    assert is_sentence(formula)
    text = "∀x(P(x) → ∃xQ(x))"
    outer, inner = occurrences(formula)
    assert outer.binder is not None and text[outer.binder.start] == "∀"
    assert inner.binder is not None and text[inner.binder.start] == "∃"


def test_slides_08_example_b() -> None:
    # ∀x(P(x) ∧ Q(x)) → (¬P(x) ∨ Q(y)): x aparece ligada y libre; y libre.
    formula = parse("∀x (P(x) ∧ Q(x)) → (¬P(x) ∨ Q(y))")
    assert free_vars(formula) == {"x", "y"}
    assert [(o.name, o.is_free) for o in occurrences(formula)] == [
        ("x", False),
        ("x", False),
        ("x", True),
        ("y", True),
    ]


def test_slides_08_exercise_1() -> None:
    # ∃x(P(y, z) ∧ ∀y(¬Q(y, x) ∨ P(y, z)))
    formula = parse("∃x (P(y, z) ∧ ∀y (¬Q(y, x) ∨ P(y, z)))")
    assert free_vars(formula) == {"y", "z"}
    assert ordered_free_vars(formula) == ["y", "z"]
    free = [(o.name, o.is_free) for o in occurrences(formula)]
    assert free == [
        ("y", True),
        ("z", True),
        ("y", False),
        ("x", False),
        ("y", False),
        ("z", True),
    ]


def test_innermost_quantifier_binds() -> None:
    text = "∀x (P(x) ∧ ∃x Q(x))"
    formula = parse(text)
    outer, inner = occurrences(formula)
    assert outer.binder is not None and inner.binder is not None
    assert text[outer.binder.start] == "∀"
    assert text[inner.binder.start] == "∃"


def test_ordered_free_vars_keeps_first_appearance() -> None:
    assert ordered_free_vars(parse("R(z, x) ∧ R(x, y) ∧ ∀z R(z, z)")) == ["z", "x", "y"]


@given(formulas)
def test_quantifier_removes_variable(formula: Formula) -> None:
    for var in ("x", "y"):
        assert var not in free_vars(ForAll(var, formula))
        assert free_vars(Exists(var, formula)) == free_vars(formula) - {var}


@given(formulas)
def test_occurrences_agree_with_free_vars(formula: Formula) -> None:
    assert {o.name for o in occurrences(formula) if o.is_free} == free_vars(formula)
