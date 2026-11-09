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
    ],
)
def test_format_formula(text: str, minimal: str, full: str) -> None:
    formula = parse(text)
    assert format_formula(formula) == minimal
    assert format_formula(formula, full_parens=True) == full
