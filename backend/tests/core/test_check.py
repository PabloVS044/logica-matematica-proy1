import pytest

from evaluador.core.check import check_formula
from evaluador.core.errors import Severity
from evaluador.core.language import Signature
from evaluador.core.parser import parse

from .conftest import make_signature


def codes(text: str, signature: Signature) -> list[str]:
    return [d.code for d in check_formula(parse(text), signature)]


# Slides 07, ejercicio 4: 𝒞 = {m}, ℱ = {f/1}, ℛ = {S/2, B/2}.
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("S(m, x)", []),  # a. sí es fórmula
        ("B(m, f(m))", []),  # b. sí
        ("f(m)", ["E-SYM-002"]),  # c. f es símbolo funcional: es un término, no una fórmula
        ("B(B(m, x), y)", ["E-SYM-002"]),  # d. B es predicado, no puede ir como argumento
        ("S(B(m), z)", ["E-SYM-002"]),  # e. ídem
        ("B(x, y) → ∃z S(z, y)", []),  # f. sí
        ("S(x, y) → S(y, f(f(x)))", []),  # g. sí
        ("B(x) → B(B(x))", ["E-ARI-001", "E-ARI-001", "E-SYM-002"]),  # h. aridades y B anidado
    ],
)
def test_course_exercise_4(text: str, expected: list[str], exercise4_signature: Signature) -> None:
    assert codes(text, exercise4_signature) == expected


def test_undeclared_symbols_all_reported(exercise4_signature: Signature) -> None:
    diagnostics = check_formula(parse("P(k) ∧ S(g(m), n)"), exercise4_signature)
    assert [d.code for d in diagnostics] == ["E-SYM-001", "E-SYM-001", "E-SYM-001", "E-SYM-001"]
    assert all(d.location.span is not None for d in diagnostics)


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("S(m(x), x)", "E-SYM-002"),  # constante con argumentos
        ("S(f, x)", "E-ARI-001"),  # función sin argumentos
        ("S(S, x)", "E-SYM-002"),  # predicado como término
        ("m(x)", "E-SYM-002"),  # constante usada como predicado
        ("S(x)", "E-ARI-001"),
        ("S(f(x, x), x)", "E-ARI-001"),
        ("f(x) = f(m, m)", "E-ARI-001"),
    ],
)
def test_category_and_arity_errors(text: str, code: str, exercise4_signature: Signature) -> None:
    assert codes(text, exercise4_signature) == [code]


def test_arity_message(exercise4_signature: Signature) -> None:
    (diagnostic,) = check_formula(parse("S(x)"), exercise4_signature)
    assert diagnostic.message == "'S' espera 2 argumentos, pero recibió 1."


def test_vacuous_quantifier_is_a_warning() -> None:
    signature = make_signature(predicates={"P": 1})
    (diagnostic,) = check_formula(parse("∀y P(x)"), signature)
    assert diagnostic.code == "W-QNT-001"
    assert diagnostic.severity is Severity.WARNING


def test_shadowed_quantifier_is_valid() -> None:
    signature = make_signature(predicates={"P": 1, "Q": 1})
    assert check_formula(parse("∀x (P(x) ∧ ∃x Q(x))"), signature) == []


def test_equality_needs_no_declaration() -> None:
    assert check_formula(parse("∀x x = x"), make_signature()) == []
