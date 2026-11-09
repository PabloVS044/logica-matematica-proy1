"""Análisis léxico: convierte el texto de una fórmula en una lista de tokens.

Acepta los símbolos Unicode del curso y alternativas ASCII para escribir con
teclado (ver tabla `_SYMBOLS` y `_KEYWORDS`).
"""

import re

from evaluador.core.errors import Diagnostic, DiagnosticError, Location, Span
from evaluador.core.tokens import Token, TokenKind

# Símbolos de varios caracteres primero: se aplica la coincidencia más larga.
_SYMBOLS: list[tuple[str, TokenKind]] = sorted(
    [
        ("¬", TokenKind.NOT),
        ("~", TokenKind.NOT),
        ("!", TokenKind.NOT),
        ("∧", TokenKind.AND),
        ("&", TokenKind.AND),
        ("/\\", TokenKind.AND),
        ("∨", TokenKind.OR),
        ("|", TokenKind.OR),
        ("\\/", TokenKind.OR),
        ("→", TokenKind.IMPLIES),
        ("->", TokenKind.IMPLIES),
        ("=>", TokenKind.IMPLIES),
        ("∀", TokenKind.FORALL),
        ("\\A", TokenKind.FORALL),
        ("∃", TokenKind.EXISTS),
        ("\\E", TokenKind.EXISTS),
        ("=", TokenKind.EQ),
        ("(", TokenKind.LPAREN),
        (")", TokenKind.RPAREN),
        (",", TokenKind.COMMA),
        (".", TokenKind.DOT),
    ],
    key=lambda pair: -len(pair[0]),
)

_KEYWORDS: dict[str, TokenKind] = {
    "not": TokenKind.NOT,
    "and": TokenKind.AND,
    "or": TokenKind.OR,
    "forall": TokenKind.FORALL,
    "exists": TokenKind.EXISTS,
}

KEYWORDS: frozenset[str] = frozenset(_KEYWORDS)

_SUBSCRIPTS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
_WORD_CHAR = re.compile(r"[A-Za-z0-9_₀-₉]")
VARIABLE_PATTERN = re.compile(r"[u-z]([0-9]+|[₀-₉]+)?")
IDENTIFIER_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9_]*")


def is_variable_name(name: str) -> bool:
    """Variables: u, v, w, x, y, z con dígitos opcionales (x, y2, z₁)."""
    return VARIABLE_PATTERN.fullmatch(name) is not None


def is_identifier_name(name: str) -> bool:
    """Nombres válidos para constantes, funciones y predicados."""
    return (
        IDENTIFIER_PATTERN.fullmatch(name) is not None
        and not is_variable_name(name)
        and name not in KEYWORDS
    )


def tokenize(text: str) -> list[Token]:
    """Devuelve los tokens de `text`, terminando con un token EOF.

    Lanza `DiagnosticError` ante el primer carácter o palabra no reconocidos.
    """
    tokens: list[Token] = []
    i = 0
    n = len(text)
    while i < n:
        char = text[i]
        if char.isspace():
            i += 1
            continue

        if _WORD_CHAR.match(char):
            start = i
            while i < n and _WORD_CHAR.match(text[i]):
                i += 1
            tokens.append(_classify_word(text[start:i], Span(start, i)))
            continue

        symbol = _match_symbol(text, i)
        if symbol is None:
            raise DiagnosticError(
                Diagnostic(
                    code="E-LEX-001",
                    message=f"Carácter no reconocido '{char}' en la posición {i + 1}.",
                    location=Location("formula", Span(i, i + 1)),
                )
            )
        lexeme, kind = symbol
        tokens.append(Token(kind, kind.value, Span(i, i + len(lexeme))))
        i += len(lexeme)

    tokens.append(Token(TokenKind.EOF, "", Span(n, n)))
    return tokens


def _match_symbol(text: str, i: int) -> tuple[str, TokenKind] | None:
    for lexeme, kind in _SYMBOLS:
        if text.startswith(lexeme, i):
            return lexeme, kind
    return None


def _classify_word(word: str, span: Span) -> Token:
    if is_variable_name(word):
        return Token(TokenKind.VAR, word.translate(_SUBSCRIPTS), span)
    if word in _KEYWORDS:
        kind = _KEYWORDS[word]
        return Token(kind, kind.value, span)
    if IDENTIFIER_PATTERN.fullmatch(word):
        return Token(TokenKind.IDENT, word, span)
    raise DiagnosticError(
        Diagnostic(
            code="E-LEX-002",
            message=(
                f"'{word}' no es un nombre válido. Las variables son u, v, w, x, y, z "
                "(con dígitos opcionales) y los símbolos deben empezar con una letra."
            ),
            location=Location("formula", span),
        )
    )
