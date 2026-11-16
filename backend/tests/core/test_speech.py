import pytest
from hypothesis import given, settings

from evaluador.core.language import Signature, SymbolKind
from evaluador.core.parser import parse
from evaluador.core.speech import (
    Command,
    Role,
    SymbolProposal,
    detect_command,
    normalize,
    tokenize,
    translate,
)
from evaluador.core.syntax_tree import Formula
from evaluador.core.verbalize import verbalize

from .conftest import make_signature
from .strategies import CONSTANTS, FUNCTIONS, PREDICATES, formulas


@pytest.fixture
def signature() -> Signature:
    return make_signature(["i", "zero"], {"f": 1, "plus": 2}, {"P": 1, "R": 2, "Q": 2, "isEven": 1})


def written(transcript: str, signature: Signature) -> str | None:
    return translate(transcript, signature).text


@pytest.mark.parametrize(
    ("transcript", "formula"),
    [
        # cuantificadores y alcance
        ("para todo x tal que P de x implica Q de x coma x", "∀x (P(x) → Q(x, x))"),
        ("Para todo X, P de X implica P de i.", "∀x (P(x) → P(i))"),
        ("para todo x P de x implica P de i", "∀x P(x) → P(i)"),
        ("existe un y tal que R de i coma y", "∃y R(i, y)"),
        ("hay una x tal que P de x", "∃x P(x)"),
        ("para cada x existe y tal que R de x coma y", "∀x ∃y R(x, y)"),
        ("para todo x y existe y tal que R de x coma y", "∀x ∃y R(x, y)"),
        ("para todo x y y, R de x coma y", "∀x ∀y R(x, y)"),
        ("para todo x coma y tal que R de x coma y", "∀x ∀y R(x, y)"),
        # "y" como variable o como conectivo según el contexto
        ("R de x y y", "R(x, y)"),
        ("P de x y P de y", "P(x) ∧ P(y)"),
        ("R de x y y y P de y", "R(x, y) ∧ P(y)"),
        # nombres de letras y mayúsculas
        ("pe de equis o erre de equis coma i griega", "P(x) ∨ R(x, y)"),
        ("para todo zeta, P de zeta", "∀z P(z)"),
        ("P de doble ve", "P(w)"),
        # conectivos
        ("no P de x", "¬P(x)"),
        ("no es cierto que P de x y P de i", "¬(P(x) ∧ P(i))"),
        ("si P de x entonces P de i", "P(x) → P(i)"),
        ("P de x implica P de y implica P de i", "P(x) → P(y) → P(i)"),
        ("abre paréntesis P de x o P de y cierra paréntesis y P de i", "(P(x) ∨ P(y)) ∧ P(i)"),
        # igualdad y funciones
        ("f de x es igual a zero", "f(x) = zero"),
        ("plus de x coma f de y igual a i", "plus(x, f(y)) = i"),
        ("x es distinto de y", "¬x = y"),
        ("P abre paréntesis f de x cierra paréntesis", "P(f(x))"),
        # puntuación del reconocedor
        ("Q(x, y) = ", None),
        ("R de x, y", "R(x, y)"),
        # nombres de varias palabras y subíndices
        ("para todo x is even de x", "∀x isEven(x)"),
        ("P de x sub uno", "P(x1)"),
        ("P de x 2", "P(x2)"),
    ],
)
def test_translate(transcript: str, formula: str | None, signature: Signature) -> None:
    assert written(transcript, signature) == formula


@pytest.mark.parametrize(
    ("transcript", "code", "word"),
    [
        ("", "E-SPK-004", None),
        ("P de pato", "E-SPK-001", "pato"),
        ("para todo P de x", "E-SPK-002", "P"),
        ("R de x", "E-SPK-002", None),
        ("P de x cierra paréntesis", "E-SPK-002", "cierra paréntesis"),
        ("abre paréntesis P de x", "E-SPK-002", None),
        ("x y", "E-SPK-002", "y"),
        ("Q de P coma x", "E-SPK-003", "P"),
        ("si P de x P de i", "E-SPK-002", "P"),
    ],
)
def test_errors(transcript: str, code: str, word: str | None, signature: Signature) -> None:
    result = translate(transcript, signature)
    assert not result.ok
    (diagnostic,) = result.diagnostics
    assert diagnostic.code == code
    span = diagnostic.location.span
    assert span is not None
    if word is not None:
        assert transcript[span.start : span.end] == word


def test_marks_describe_each_word(signature: Signature) -> None:
    result = translate("para todo equis, P de equis", signature)
    assert [(m.text, m.role, m.meaning) for m in result.marks] == [
        ("para todo", Role.KEYWORD, "∀"),
        ("equis", Role.VARIABLE, "x"),
        (",", Role.KEYWORD, "tal que"),
        ("P", Role.SYMBOL, "P"),
        ("de", Role.KEYWORD, "("),
        ("equis", Role.VARIABLE, "x"),
    ]


def test_marks_after_error_are_unknown(signature: Signature) -> None:
    marks = translate("P de pato y P de x", signature).marks
    assert marks[2].role is Role.UNKNOWN
    assert marks[-1].role is Role.UNKNOWN


def test_tokenize_prefers_longest_phrase() -> None:
    assert [t.norm for t in tokenize("no es cierto que x es igual a a")] == [
        "no es cierto que",
        "x",
        "es igual a",
        "a",
    ]


def test_normalize() -> None:
    assert normalize("Paréntesis ÑANDÚ") == "parentesis ñandu"


@pytest.mark.parametrize(
    ("utterance", "command"),
    [
        ("Borra eso", Command.UNDO),
        ("borrar todo.", Command.CLEAR),
        ("Listo", Command.ACCEPT),
        ("evalúa", Command.EVALUATE),
        ("cancelar", Command.CANCEL),
        ("Declara", Command.DECLARE),
        ("declaralo", Command.DECLARE),
        ("para todo x P de x", None),
        ("listo para todo", None),
    ],
)
def test_detect_command(utterance: str, command: Command | None) -> None:
    assert detect_command(utterance) is command


# ------------------------------------------------------------------ ida y vuelta

_STRATEGY_SIGNATURE = make_signature(CONSTANTS, FUNCTIONS, PREDICATES)


@settings(max_examples=300)
@given(formulas)
def test_round_trip(formula: Formula) -> None:
    spoken = verbalize(formula)
    assert translate(spoken, _STRATEGY_SIGNATURE).formula == formula, spoken


@settings(max_examples=300)
@given(formulas)
def test_round_trip_with_letter_names(formula: Formula) -> None:
    spoken = verbalize(formula, spell=True)
    assert translate(spoken, _STRATEGY_SIGNATURE).formula == formula, spoken


def test_course_formulas_round_trip(signature: Signature) -> None:
    for text in [
        "∀x ∀y ∀z (Q(x, y) ∧ Q(x, z) → y = z)",
        "∀x ∃y plus(x, y) = zero",
        "∃x ∀y (x = y ∨ Q(x, y))",
        "¬∀x (isEven(x) ∨ isEven(f(x)))",
    ]:
        formula = parse(text)
        assert translate(verbalize(formula), signature).formula == formula
        assert translate(verbalize(formula, spell=True), signature).formula == formula


# ------------------------------------------------------------------ símbolos sin declarar

# Sin Q: lo que se dicte con «q» o «cu» falta declararlo.
_WITHOUT_Q = make_signature(["i", "zero"], {"f": 1, "plus": 2}, {"P": 1, "R": 2, "isEven": 1})


@pytest.mark.parametrize(
    ("transcript", "name", "kind", "arity", "formula"),
    [
        (
            "para todo x tal que P de x implica q de x",
            "Q",
            SymbolKind.PREDICATE,
            1,
            "∀x (P(x) → Q(x))",
        ),
        ("cu de x coma i", "Q", SymbolKind.PREDICATE, 2, "Q(x, i)"),
        ("R de x coma ge de x", "g", SymbolKind.FUNCTION, 1, "R(x, g(x))"),
        ("g de x coma y es igual a i", "g", SymbolKind.FUNCTION, 2, "g(x, y) = i"),
        ("P de pato", "pato", SymbolKind.CONSTANT, 0, "P(pato)"),
        ("x es igual a eme", "m", SymbolKind.CONSTANT, 0, "x = m"),
    ],
)
def test_proposes_missing_symbol(
    transcript: str, name: str, kind: SymbolKind, arity: int, formula: str
) -> None:
    result = translate(transcript, _WITHOUT_Q)
    assert not result.ok
    assert result.proposal == SymbolProposal(name, kind, arity, formula)


def test_no_proposal_if_the_rest_still_fails() -> None:
    # Declarar Q no evita el error de sintaxis que sigue ("de x" sobra).
    assert translate("q de x y z de x", _WITHOUT_Q).proposal is None


def test_proposals_chain_when_several_symbols_are_missing() -> None:
    empty = make_signature()
    first = translate("para todo x tal que p de x implica q de x", empty)
    assert first.proposal == SymbolProposal("P", SymbolKind.PREDICATE, 1, None)
    with_p = make_signature(predicates={"P": 1})
    second = translate("para todo x tal que p de x implica q de x", with_p)
    assert second.proposal == SymbolProposal("Q", SymbolKind.PREDICATE, 1, "∀x (P(x) → Q(x))")


def test_no_proposal_for_a_name_declared_with_another_kind() -> None:
    # i es una constante: no se propone otro símbolo llamado i.
    assert translate("i de x", _WITHOUT_Q).proposal is None


def test_unknown_message_lists_declared_symbols() -> None:
    (diagnostic,) = translate("P de x implica q de x", _WITHOUT_Q).diagnostics
    assert diagnostic.code == "E-SPK-001"
    assert diagnostic.message == (
        "«q» no es un símbolo del lenguaje: no hay ningún predicado Q. "
        "Los predicados declarados son P, R y isEven."
    )


def test_unknown_message_suggests_similar_name() -> None:
    (diagnostic,) = translate("P de x y is evn de x", _WITHOUT_Q).diagnostics
    assert diagnostic.message.endswith("¿Quisiste decir «isEven»?")


def test_unknown_message_without_declared_symbols() -> None:
    (diagnostic,) = translate("P de x", make_signature()).diagnostics
    assert "No hay predicados declarados." in diagnostic.message


# ------------------------------------------------------------------ mayúsculas y minúsculas

# p y P a la vez, y una constante X (que suena como la variable x).
_CASES = make_signature(["c", "X"], {"f": 1, "F": 1}, {"P": 1, "p": 1, "R": 2})


@pytest.mark.parametrize(
    ("transcript", "formula"),
    [
        ("pe mayúscula de x", "P(x)"),
        ("P minúscula de x", "p(x)"),
        ("pe mayúsculas de x y pe minúscula de x", "P(x) ∧ p(x)"),
        ("R de equis mayúscula coma x", "R(X, x)"),
        ("R de X coma x", "R(x, x)"),  # sin la palabra, X es la variable x
        ("x minúscula es igual a efe mayúscula de equis mayúscula", "x = F(X)"),
        ("erre de c coma ce minúscula", "R(c, c)"),
    ],
)
def test_case_words(transcript: str, formula: str) -> None:
    assert translate(transcript, _CASES).text == formula


def test_case_is_asked_when_two_symbols_sound_the_same() -> None:
    result = translate("pe de x", _CASES)
    (diagnostic,) = result.diagnostics
    assert diagnostic.code == "E-SPK-005"
    assert diagnostic.message == (
        "Hay 2 símbolos que se dicen «pe»: P y p. Di «pe mayúscula» o «pe minúscula»."
    )


def test_case_is_not_needed_when_there_is_no_ambiguity() -> None:
    assert translate("pe de x", _WITHOUT_Q).text == "P(x)"


def test_case_words_fix_the_name_of_a_new_symbol() -> None:
    proposal = translate("ka minúscula de x", _WITHOUT_Q).proposal
    assert proposal == SymbolProposal("k", SymbolKind.PREDICATE, 1, "k(x)")
    constant = translate("P de be mayúscula", _WITHOUT_Q).proposal
    assert constant == SymbolProposal("B", SymbolKind.CONSTANT, 0, "P(B)")


@pytest.mark.parametrize(
    "text",
    [
        "P(x) ∧ p(X)",
        "∀x (p(f(x)) → P(F(X)))",
        "R(X, x) ∨ ¬p(c)",
        "∃y F(y) = f(X)",
    ],
)
def test_round_trip_with_case_ambiguity(text: str) -> None:
    formula = parse(text)
    names = _CASES.all_names()
    for spell in (False, True):
        spoken = verbalize(formula, spell=spell, names=names)
        assert translate(spoken, _CASES).formula == formula, spoken
