"""Análisis sintáctico por descenso recursivo.

Gramática (de menor a mayor precedencia):

    formula     = implication
    implication = disjunction [ "→" implication ]          (asociativa a derecha)
    disjunction = conjunction { "∨" conjunction }           (asociativa a izquierda)
    conjunction = unary { "∧" unary }                       (asociativa a izquierda)
    unary       = "¬" unary
                | ("∀" | "∃") VAR ["."] unary
                | atom
    atom        = "(" formula ")"
                | term "=" term
                | IDENT "(" term { "," term } ")"            (predicado)
    term        = VAR | IDENT | IDENT "(" term { "," term } ")"

El parser no consulta la signatura: decide entre ecuación y predicado mirando si
después viene "=". Así los errores de sintaxis quedan separados de los errores de
símbolos y aridades, que detecta `check.py`.

Cada no terminal es una función. Se detiene en el primer error de sintaxis.
"""

from dataclasses import dataclass, replace
from typing import NoReturn

from evaluador.core.errors import Diagnostic, DiagnosticError, Location, Span
from evaluador.core.lexer import tokenize
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
    Term,
    Var,
)
from evaluador.core.tokens import Token, TokenKind


@dataclass(frozen=True, slots=True)
class ParseResult:
    formula: Formula | None
    diagnostics: list[Diagnostic]


def parse_formula(text: str) -> ParseResult:
    """Analiza `text`. Si hay error, `formula` es None y hay un diagnóstico."""
    try:
        tokens = tokenize(text)
        formula = _Parser(tokens).parse()
    except DiagnosticError as error:
        return ParseResult(None, [error.diagnostic])
    return ParseResult(formula, [])


def parse(text: str) -> Formula:
    """Como `parse_formula`, pero lanza `DiagnosticError` si hay error (útil en tests)."""
    return _Parser(tokenize(text)).parse()


class _Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    # ------------------------------------------------------------ utilidades

    @property
    def current(self) -> Token:
        return self.tokens[self.pos]

    def advance(self) -> Token:
        token = self.tokens[self.pos]
        if token.kind is not TokenKind.EOF:
            self.pos += 1
        return token

    def check(self, kind: TokenKind) -> bool:
        return self.current.kind is kind

    def expect(self, kind: TokenKind, what: str) -> Token:
        if not self.check(kind):
            self.fail_expected(what)
        return self.advance()

    def error(self, code: str, message: str, span: Span) -> DiagnosticError:
        return DiagnosticError(Diagnostic(code, message, Location("formula", span)))

    def fail_expected(self, what: str) -> NoReturn:
        token = self.current
        if token.kind is TokenKind.EOF:
            raise self.error(
                "E-SYN-004",
                f"La fórmula terminó antes de tiempo: se esperaba {what}.",
                token.span,
            )
        raise self.error(
            "E-SYN-001",
            f"Se esperaba {what}, pero se encontró {token.describe()}.",
            token.span,
        )

    # ------------------------------------------------------------ gramática

    def parse(self) -> Formula:
        if self.check(TokenKind.EOF):
            raise self.error("E-SYN-004", "La fórmula está vacía.", self.current.span)
        formula = self.parse_implication()
        if self.check(TokenKind.RPAREN):
            raise self.error(
                "E-SYN-002",
                "Paréntesis de cierre ')' sin su paréntesis de apertura.",
                self.current.span,
            )
        if not self.check(TokenKind.EOF):
            self.fail_expected("un conectivo (∧, ∨, →) o el fin de la fórmula")
        return formula

    def parse_implication(self) -> Formula:
        left = self.parse_disjunction()
        if self.check(TokenKind.IMPLIES):
            self.advance()
            right = self.parse_implication()  # recursión a derecha: a → (b → c)
            return Implies(left, right, left.span.merge(right.span))
        return left

    def parse_disjunction(self) -> Formula:
        left = self.parse_conjunction()
        while self.check(TokenKind.OR):
            self.advance()
            right = self.parse_conjunction()
            left = Or(left, right, left.span.merge(right.span))
        return left

    def parse_conjunction(self) -> Formula:
        left = self.parse_unary()
        while self.check(TokenKind.AND):
            self.advance()
            right = self.parse_unary()
            left = And(left, right, left.span.merge(right.span))
        return left

    def parse_unary(self) -> Formula:
        token = self.current
        if token.kind is TokenKind.NOT:
            self.advance()
            body = self.parse_unary()
            return Not(body, token.span.merge(body.span))

        if token.kind in (TokenKind.FORALL, TokenKind.EXISTS):
            self.advance()
            var = self.parse_bound_variable(token)
            if self.check(TokenKind.DOT):
                self.advance()
            body = self.parse_unary()
            span = token.span.merge(body.span)
            if token.kind is TokenKind.FORALL:
                return ForAll(var, body, span)
            return Exists(var, body, span)

        return self.parse_atom()

    def parse_bound_variable(self, quantifier: Token) -> str:
        if self.check(TokenKind.VAR):
            return self.advance().text
        found = self.current
        detail = (
            f"se encontró {found.describe()}"
            if found.kind is not TokenKind.EOF
            else "la fórmula terminó"
        )
        raise self.error(
            "E-SYN-003",
            f"Después de '{quantifier.kind.value}' debe ir una variable "
            f"(u, v, w, x, y, z con dígitos opcionales), pero {detail}.",
            quantifier.span.merge(found.span),
        )

    def parse_atom(self) -> Formula:
        token = self.current

        if token.kind is TokenKind.LPAREN:
            self.advance()
            inner = self.parse_implication()
            if not self.check(TokenKind.RPAREN):
                if self.check(TokenKind.EOF):
                    raise self.error(
                        "E-SYN-002",
                        "Falta cerrar el paréntesis abierto aquí.",
                        token.span,
                    )
                self.fail_expected("')' o un conectivo")
            close = self.advance()
            # El span incluye los paréntesis, para resaltar la subfórmula completa.
            return replace(inner, span=token.span.merge(close.span))

        if token.kind in (TokenKind.VAR, TokenKind.IDENT):
            return self.parse_equation_or_predicate()

        self.fail_expected("una fórmula (predicado, igualdad, ¬, ∀, ∃ o '(')")

    def parse_equation_or_predicate(self) -> Formula:
        start = self.current
        if start.kind is TokenKind.IDENT and self.tokens[self.pos + 1].kind is TokenKind.LPAREN:
            name = self.advance().text
            args, end = self.parse_arguments()
            span = start.span.merge(end)
            if self.check(TokenKind.EQ):
                # Era un término f(...) a la izquierda de una igualdad.
                return self.finish_equation(Func(name, args, span))
            return Pred(name, args, span)

        left = self.parse_term()
        if not self.check(TokenKind.EQ):
            kind = "La variable" if isinstance(left, Var) else "El término"
            raise self.error(
                "E-SYN-005",
                f"{kind} '{start.text}' no es una fórmula: falta '= término' o, si es "
                "un predicado, sus argumentos entre paréntesis.",
                left.span,
            )
        return self.finish_equation(left)

    def finish_equation(self, left: Term) -> Eq:
        self.expect(TokenKind.EQ, "'='")
        right = self.parse_term()
        return Eq(left, right, left.span.merge(right.span))

    def parse_term(self) -> Term:
        token = self.current
        if token.kind is TokenKind.VAR:
            self.advance()
            return Var(token.text, token.span)
        if token.kind is TokenKind.IDENT:
            self.advance()
            if self.check(TokenKind.LPAREN):
                args, end = self.parse_arguments()
                return Func(token.text, args, token.span.merge(end))
            return Const(token.text, token.span)
        self.fail_expected("un término (variable, constante o función aplicada)")

    def parse_arguments(self) -> tuple[tuple[Term, ...], Span]:
        """Lee "(" term { "," term } ")" y devuelve los términos y el span de ')'."""
        open_paren = self.expect(TokenKind.LPAREN, "'('")
        if self.check(TokenKind.RPAREN):
            raise self.error(
                "E-SYN-001",
                "La lista de argumentos está vacía: se esperaba al menos un término.",
                open_paren.span.merge(self.current.span),
            )
        args = [self.parse_term()]
        while self.check(TokenKind.COMMA):
            self.advance()
            args.append(self.parse_term())
        if self.check(TokenKind.EOF):
            raise self.error(
                "E-SYN-002",
                "Falta cerrar el paréntesis de los argumentos abierto aquí.",
                open_paren.span,
            )
        close = self.expect(TokenKind.RPAREN, "',' o ')'")
        return tuple(args), close.span
