"""Conversión de términos y fórmulas a texto.

- `format_formula(φ)`: paréntesis mínimos según la precedencia del parser.
  Cumple `parse(format_formula(φ)) == φ`.
- `format_formula(φ, full_parens=True)`: cada subfórmula binaria entre paréntesis,
  para mostrar sin ambigüedad cómo se interpretó la entrada.
"""

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

# Precedencias: mayor número = liga más fuerte.
_IMPLIES, _OR, _AND, _UNARY, _ATOM = 1, 2, 3, 4, 5


def format_term(term: Term) -> str:
    match term:
        case Var(name) | Const(name):
            return name
        case Func(name, args):
            return f"{name}({', '.join(format_term(arg) for arg in args)})"


def format_formula(formula: Formula, *, full_parens: bool = False) -> str:
    return _Printer(full_parens).formula(formula)


def _precedence(formula: Formula) -> int:
    match formula:
        case Implies():
            return _IMPLIES
        case Or():
            return _OR
        case And():
            return _AND
        case Not() | ForAll() | Exists():
            return _UNARY
        case Eq() | Pred():
            return _ATOM


class _Printer:
    def __init__(self, full_parens: bool) -> None:
        self.full_parens = full_parens

    def formula(self, formula: Formula) -> str:
        match formula:
            case Eq(left, right):
                return f"{format_term(left)} = {format_term(right)}"
            case Pred(name, args):
                return f"{name}({', '.join(format_term(arg) for arg in args)})"
            case Not(body):
                return f"¬{self.operand(body, _UNARY)}"
            case ForAll(var, body):
                return f"∀{var} {self.operand(body, _UNARY)}"
            case Exists(var, body):
                return f"∃{var} {self.operand(body, _UNARY)}"
            case And(left, right):
                return self.binary(left, "∧", right, _AND, right_assoc=False)
            case Or(left, right):
                return self.binary(left, "∨", right, _OR, right_assoc=False)
            case Implies(left, right):
                return self.binary(left, "→", right, _IMPLIES, right_assoc=True)

    def binary(
        self, left: Formula, op: str, right: Formula, prec: int, *, right_assoc: bool
    ) -> str:
        # En un operador asociativo a izquierda, el hijo derecho de igual precedencia
        # necesita paréntesis; en uno asociativo a derecha, el izquierdo.
        left_min = prec + 1 if right_assoc else prec
        right_min = prec if right_assoc else prec + 1
        return f"{self.operand(left, left_min)} {op} {self.operand(right, right_min)}"

    def operand(self, formula: Formula, min_prec: int) -> str:
        text = self.formula(formula)
        needs_parens = _precedence(formula) < min_prec
        if self.full_parens and isinstance(formula, And | Or | Implies):
            needs_parens = True
        return f"({text})" if needs_parens else text
