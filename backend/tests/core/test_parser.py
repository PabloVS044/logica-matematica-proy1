import pytest
from hypothesis import given

from evaluador.core.errors import DiagnosticError
from evaluador.core.parser import parse, parse_formula
from evaluador.core.printer import format_formula
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
    Var,
)

from .strategies import formulas

x, y, z = Var("x"), Var("y"), Var("z")


def P(*args: Var | Const | Func) -> Pred:
    return Pred("P", args)


def Q(*args: Var | Const | Func) -> Pred:
    return Pred("Q", args)


# ------------------------------------------------------------------ estructura


def test_atomic_predicate() -> None:
    assert parse("P(x, c)") == Pred("P", (x, Const("c")))


def test_equation_with_function_terms() -> None:
    assert parse("f(x, g(y)) = c") == Eq(Func("f", (x, Func("g", (y,)))), Const("c"))


def test_equation_between_variables() -> None:
    assert parse("x = y") == Eq(x, y)


def test_quantifiers_and_optional_dot() -> None:
    expected = ForAll("x", Exists("y", Pred("R", (x, y))))
    assert parse("∀x ∃y R(x, y)") == expected
    assert parse("∀x.∃y.R(x,y)") == expected
    assert parse("forall x exists y R(x,y)") == expected
    assert parse("∀x(∃y(R(x,y)))") == expected


def test_redundant_parentheses() -> None:
    assert parse("((P(x)))") == P(x)


# ------------------------------------------------------------------ precedencia


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # ¬ liga más fuerte que ∧
        ("¬P(x) ∧ Q(x)", And(Not(P(x)), Q(x))),
        # ∧ liga más fuerte que ∨
        ("P(x) ∨ Q(x) ∧ P(y)", Or(P(x), And(Q(x), P(y)))),
        # ∨ liga más fuerte que →
        ("P(x) ∨ Q(x) → P(y)", Implies(Or(P(x), Q(x)), P(y))),
        # → es asociativa a derecha
        ("P(x) → Q(x) → P(y)", Implies(P(x), Implies(Q(x), P(y)))),
        # ∧ y ∨ son asociativas a izquierda
        ("P(x) ∧ Q(x) ∧ P(y)", And(And(P(x), Q(x)), P(y))),
        ("P(x) ∨ Q(x) ∨ P(y)", Or(Or(P(x), Q(x)), P(y))),
        # el cuantificador solo alcanza la fórmula unaria siguiente
        ("∀x P(x) → Q(x)", Implies(ForAll("x", P(x)), Q(x))),
        ("∀x (P(x) → Q(x))", ForAll("x", Implies(P(x), Q(x)))),
        ("¬∀x P(x)", Not(ForAll("x", P(x)))),
        # la igualdad es atómica: ¬ se aplica a toda la ecuación
        ("¬x = y", Not(Eq(x, y))),
    ],
)
def test_precedence(text: str, expected: Formula) -> None:
    assert parse(text) == expected


def test_course_formula_slides_10() -> None:
    expected = ForAll(
        "x",
        ForAll("y", ForAll("z", Implies(And(Q(x, y), Q(x, z)), Eq(y, z)))),
    )
    assert parse("∀x∀y∀z (Q(x,y) ∧ Q(x,z) → y = z)") == expected


# ------------------------------------------------------------------ spans


def test_spans() -> None:
    formula = parse("∀x (P(x) ∧ Q(y))")
    assert isinstance(formula, ForAll)
    assert (formula.span.start, formula.span.end) == (0, 16)
    body = formula.body
    assert isinstance(body, And)
    assert (body.span.start, body.span.end) == (3, 16)  # incluye los paréntesis
    assert isinstance(body.right, Pred)
    assert (body.right.span.start, body.right.span.end) == (11, 15)


# ------------------------------------------------------------------ errores


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("", "E-SYN-004"),
        ("   ", "E-SYN-004"),
        ("P(x) ∧", "E-SYN-004"),
        ("¬", "E-SYN-004"),
        ("(P(x)", "E-SYN-002"),
        ("P(x", "E-SYN-002"),
        ("P(x))", "E-SYN-002"),
        ("∀ P(x)", "E-SYN-003"),
        ("∀", "E-SYN-003"),
        ("∃c P(c)", "E-SYN-003"),
        ("x", "E-SYN-005"),
        ("c ∧ P(x)", "E-SYN-005"),
        ("P()", "E-SYN-001"),
        ("P(x) Q(x)", "E-SYN-001"),
        ("∧ P(x)", "E-SYN-001"),
        ("P(x,)", "E-SYN-001"),
        ("P(¬x)", "E-SYN-001"),
        ("x = y = z", "E-SYN-001"),
        ("x = ", "E-SYN-004"),
        ("P(x) # Q", "E-LEX-001"),
    ],
)
def test_syntax_errors(text: str, code: str) -> None:
    result = parse_formula(text)
    assert result.formula is None
    assert [d.code for d in result.diagnostics] == [code]
    assert result.diagnostics[0].location.span is not None


def test_error_message_is_spanish_and_located() -> None:
    result = parse_formula("P(x) ∧ ∧ Q(x)")
    (diagnostic,) = result.diagnostics
    assert diagnostic.message.startswith("Se esperaba")
    assert diagnostic.location.span is not None
    assert diagnostic.location.span.start == 7


def test_parse_raises() -> None:
    with pytest.raises(DiagnosticError):
        parse("(")


# ------------------------------------------------------------------ propiedades


@given(formulas)
def test_round_trip_minimal_parens(formula: Formula) -> None:
    assert parse(format_formula(formula)) == formula


@given(formulas)
def test_round_trip_full_parens(formula: Formula) -> None:
    assert parse(format_formula(formula, full_parens=True)) == formula
