import pytest

from evaluador.core.environment import Environment
from evaluador.core.interpretation import Interpretation
from evaluador.core.parser import parse
from evaluador.core.semantics import eval_term, satisfies
from evaluador.core.syntax_tree import Const, Func, Var

# 𝒟 = {0, 1, 2}, sᴵ(n) = n + 1 mod 3, zero = 0, P = pares, L = "menor que"
MOD3 = Interpretation(
    domain=("0", "1", "2"),
    constants={"zero": "0"},
    functions={
        "s": {("0",): "1", ("1",): "2", ("2",): "0"},
        "plus": {(a, b): str((int(a) + int(b)) % 3) for a in "012" for b in "012"},
    },
    predicates={
        "Even": frozenset({("0",), ("2",)}),
        "L": frozenset({("0", "1"), ("0", "2"), ("1", "2")}),
    },
)


def holds(text: str, **env: str) -> bool:
    return satisfies(parse(text), MOD3, Environment(env))


def test_eval_term() -> None:
    env = Environment({"x": "2"})
    assert eval_term(Var("x"), MOD3, env) == "2"
    assert eval_term(Const("zero"), MOD3, env) == "0"
    assert eval_term(Func("s", (Func("s", (Var("x"),)),)), MOD3, env) == "1"
    assert eval_term(Func("plus", (Var("x"), Func("s", (Const("zero"),)))), MOD3, env) == "0"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("s(zero) = s(s(s(s(zero))))", True),
        ("¬Even(s(zero))", True),
        ("Even(zero) ∧ Even(s(zero))", False),
        ("Even(zero) ∨ Even(s(zero))", True),
        ("Even(s(zero)) → L(zero, zero)", True),  # antecedente falso
        ("Even(zero) → L(zero, zero)", False),
        ("∀x s(s(s(x))) = x", True),
        ("∀x ∃y plus(x, y) = zero", True),  # inverso aditivo
        ("∃x ∀y L(x, y)", False),
        ("∃x ∀y (x = y ∨ L(x, y))", True),  # mínimo
        ("∀x ∀y (L(x, y) → ¬L(y, x))", True),  # asimetría
        ("∀x (Even(x) ∨ Even(s(x)))", True),
    ],
)
def test_sentences(text: str, expected: bool) -> None:
    assert holds(text) is expected


def test_open_formula_depends_on_environment() -> None:
    assert holds("Even(x)", x="0")
    assert not holds("Even(x)", x="1")


def test_quantifier_overrides_environment() -> None:
    # La x ligada no usa l(x).
    assert holds("∀x s(s(s(x))) = x", x="1")
    assert not holds("∃x L(x, x)", x="0")


def test_shadowing() -> None:
    # ∀x (Even(x) → ∃x ¬Even(x)): la x interna es otra variable.
    assert holds("∀x (Even(x) → ∃x ¬Even(x))")
