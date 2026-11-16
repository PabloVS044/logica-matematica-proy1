import pytest

from evaluador.core.parser import parse
from evaluador.core.verbalize import verbalize, verbalize_term


@pytest.mark.parametrize(
    ("text", "spoken"),
    [
        ("P(x)", "P de x"),
        ("R(x, f(y))", "R de x coma f de y"),
        ("x = c", "x es igual a c"),
        ("¬P(x)", "no P de x"),
        ("¬(P(x) ∧ Q(x))", "no es cierto que P de x y Q de x"),
        (
            "¬(P(x) ∧ Q(x)) ∨ R(x, x)",
            "no abre paréntesis P de x y Q de x cierra paréntesis o R de x coma x",
        ),
        ("∀x (P(x) → Q(x))", "para todo x tal que P de x implica Q de x"),
        ("∀x P(x) → Q(x)", "para todo x P de x implica Q de x"),
        (
            "∀x (P(x) → Q(x)) ∧ P(c)",
            "para todo x abre paréntesis P de x implica Q de x cierra paréntesis y P de c",
        ),
        ("∃x ∀y R(x, y)", "existe x para todo y R de x coma y"),
        (
            "(P(x) → Q(x)) → P(y)",
            "abre paréntesis P de x implica Q de x cierra paréntesis implica P de y",
        ),
        ("P(x) → Q(x) → P(y)", "P de x implica Q de x implica P de y"),
        ("P(x) ∧ ∀y (Q(y) ∨ P(y))", "P de x y para todo y tal que Q de y o P de y"),
    ],
)
def test_verbalize(text: str, spoken: str) -> None:
    assert verbalize(parse(text)) == spoken


def test_spell_letter_names() -> None:
    assert (
        verbalize(parse("∀y R(x, y)"), spell=True)
        == "para todo i griega erre de equis coma i griega"
    )
    assert verbalize(parse("P(x1) ∧ Even(w)"), spell=True) == "pe de equis 1 y Even de doble ve"


def test_verbalize_term() -> None:
    assert verbalize_term(parse("f(g(x, c)) = c").left, spell=True) == "efe de ge de equis coma ce"  # type: ignore[attr-defined]
