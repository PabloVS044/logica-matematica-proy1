import pytest

from evaluador.core.errors import DiagnosticError
from evaluador.core.lexer import is_identifier_name, is_variable_name, tokenize
from evaluador.core.tokens import TokenKind as K


def kinds(text: str) -> list[K]:
    return [t.kind for t in tokenize(text)][:-1]  # sin EOF


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("¬ ~ ! not", [K.NOT] * 4),
        ("∧ & /\\ and", [K.AND] * 4),
        ("∨ | \\/ or", [K.OR] * 4),
        ("→ -> =>", [K.IMPLIES] * 3),
        ("∀ \\A forall", [K.FORALL] * 3),
        ("∃ \\E exists", [K.EXISTS] * 3),
        ("= ( ) , .", [K.EQ, K.LPAREN, K.RPAREN, K.COMMA, K.DOT]),
    ],
)
def test_symbols_and_ascii_alternatives(text: str, expected: list[K]) -> None:
    assert kinds(text) == expected


def test_longest_match_distinguishes_eq_and_implies() -> None:
    assert kinds("x=>y") == [K.VAR, K.IMPLIES, K.VAR]
    assert kinds("x=y") == [K.VAR, K.EQ, K.VAR]


@pytest.mark.parametrize("name", ["x", "y", "z", "u", "v", "w", "x1", "y23", "z₁"])
def test_variables(name: str) -> None:
    assert kinds(name) == [K.VAR]


@pytest.mark.parametrize("name", ["P", "f", "socrates", "a", "Q2", "xa", "X", "is_even"])
def test_identifiers(name: str) -> None:
    assert kinds(name) == [K.IDENT]


def test_subscripts_are_normalized() -> None:
    assert tokenize("x₁₂")[0].text == "x12"


def test_spans_point_to_source() -> None:
    tokens = tokenize("∀x  P(x)")
    assert [(t.span.start, t.span.end) for t in tokens] == [
        (0, 1),
        (1, 2),
        (4, 5),
        (5, 6),
        (6, 7),
        (7, 8),
        (8, 8),
    ]


def test_quantifier_glued_to_variable() -> None:
    assert kinds("∀x∃y") == [K.FORALL, K.VAR, K.EXISTS, K.VAR]


@pytest.mark.parametrize(("text", "position"), [("P(x) # Q", 5), ("x + y", 2), ("∀x ↔", 3)])
def test_unknown_character(text: str, position: int) -> None:
    with pytest.raises(DiagnosticError) as info:
        tokenize(text)
    diagnostic = info.value.diagnostic
    assert diagnostic.code == "E-LEX-001"
    assert diagnostic.location.span is not None
    assert diagnostic.location.span.start == position


@pytest.mark.parametrize("word", ["1x", "P₁", "a₂"])
def test_invalid_word(word: str) -> None:
    with pytest.raises(DiagnosticError) as info:
        tokenize(word)
    assert info.value.diagnostic.code == "E-LEX-002"


def test_name_predicates() -> None:
    assert is_variable_name("x10")
    assert not is_variable_name("a")
    assert is_identifier_name("P")
    assert not is_identifier_name("x")
    assert not is_identifier_name("forall")
    assert not is_identifier_name("_P")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # Como en las presentaciones: ∃xQ(x), ∃x∀yP(x, y)
        ("∃xQ", [K.EXISTS, K.VAR, K.IDENT]),
        ("∃x∀yP", [K.EXISTS, K.VAR, K.FORALL, K.VAR, K.IDENT]),
        ("∀x1Even", [K.FORALL, K.VAR, K.IDENT]),
        # fuera de un cuantificador no se separa nada
        ("xQ", [K.IDENT]),
        ("∀xy", [K.FORALL, K.IDENT]),
    ],
)
def test_variable_glued_after_quantifier(text: str, expected: list[K]) -> None:
    assert kinds(text) == expected


def test_glued_spans() -> None:
    tokens = tokenize("∃xQ")
    assert [(t.text, t.span.start, t.span.end) for t in tokens[:3]] == [
        ("∃", 0, 1),
        ("x", 1, 2),
        ("Q", 2, 3),
    ]
