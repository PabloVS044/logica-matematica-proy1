import pytest

from evaluador.core.parser import parse
from evaluador.core.printer import format_formula, format_term
from evaluador.core.syntax_tree import Const, Func, Var


def test_format_term() -> None:
    assert format_term(Func("f", (Var("x"), Func("g", (Const("c"),))))) == "f(x, g(c))"


@pytest.mark.parametrize(
    ("text", "minimal", "full"),
    [
        ("P(x)", "P(x)", "P(x)"),
        ("P(x) ∧ Q(x) ∨ R(x)", "P(x) ∧ Q(x) ∨ R(x)", "(P(x) ∧ Q(x)) ∨ R(x)"),
        ("P(x) ∧ (Q(x) ∨ R(x))", "P(x) ∧ (Q(x) ∨ R(x))", "P(x) ∧ (Q(x) ∨ R(x))"),
        ("P(x) → Q(x) → R(x)", "P(x) → Q(x) → R(x)", "P(x) → (Q(x) → R(x))"),
        ("(P(x) → Q(x)) → R(x)", "(P(x) → Q(x)) → R(x)", "(P(x) → Q(x)) → R(x)"),
        ("∀x(P(x)->Q(x))", "∀x (P(x) → Q(x))", "∀x (P(x) → Q(x))"),
        ("~~P(x)", "¬¬P(x)", "¬¬P(x)"),
        ("forall x exists y x=y", "∀x ∃y x = y", "∀x ∃y x = y"),
        # notación del curso: el alcance de un cuantificador operando va entre paréntesis
        ("∀x P(x) → Q(x)", "(∀x P(x)) → Q(x)", "(∀x P(x)) → Q(x)"),
        ("P(x) → ∃y Q(y)", "P(x) → ∃y Q(y)", "P(x) → (∃y Q(y))"),
        ("¬∀x P(x) ∧ Q(x)", "(¬∀x P(x)) ∧ Q(x)", "(¬∀x P(x)) ∧ Q(x)"),
        ("¬P(x) ∨ Q(y)", "¬P(x) ∨ Q(y)", "¬P(x) ∨ Q(y)"),
        ("¬(x = y)", "¬(x = y)", "¬(x = y)"),
        ("∀x ∃y P(x)", "∀x ∃y P(x)", "∀x ∃y P(x)"),
    ],
)
def test_format_formula(text: str, minimal: str, full: str) -> None:
    formula = parse(text)
    assert format_formula(formula) == minimal
    assert format_formula(formula, full_parens=True) == full
