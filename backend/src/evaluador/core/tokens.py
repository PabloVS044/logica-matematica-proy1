"""Tokens del lenguaje de fórmulas."""

from dataclasses import dataclass
from enum import StrEnum

from evaluador.core.errors import Span


class TokenKind(StrEnum):
    NOT = "¬"
    AND = "∧"
    OR = "∨"
    IMPLIES = "→"
    FORALL = "∀"
    EXISTS = "∃"
    EQ = "="
    LPAREN = "("
    RPAREN = ")"
    COMMA = ","
    DOT = "."
    VAR = "variable"
    IDENT = "identificador"
    EOF = "fin de la fórmula"


@dataclass(frozen=True, slots=True)
class Token:
    kind: TokenKind
    text: str  # texto normalizado (p. ej. "x₁" se guarda como "x1")
    span: Span

    def describe(self) -> str:
        """Descripción legible para mensajes de error."""
        if self.kind in (TokenKind.VAR, TokenKind.IDENT):
            return f"'{self.text}'"
        if self.kind is TokenKind.EOF:
            return "el fin de la fórmula"
        return f"'{self.kind.value}'"
