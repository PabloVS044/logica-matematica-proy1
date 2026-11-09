"""Verificación de símbolos y aridades de una fórmula contra la signatura.

A diferencia del parser, aquí se reportan **todos** los errores encontrados.
"""

from evaluador.core.errors import Diagnostic, Location, Severity
from evaluador.core.freevars import free_vars
from evaluador.core.language import Signature, SymbolKind
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


def check_formula(formula: Formula, signature: Signature) -> list[Diagnostic]:
    checker = _Checker(signature)
    checker.formula(formula)
    return checker.diagnostics


class _Checker:
    def __init__(self, signature: Signature) -> None:
        self.signature = signature
        self.diagnostics: list[Diagnostic] = []

    def report(
        self, code: str, message: str, node: Term | Formula, severity: Severity = Severity.ERROR
    ) -> None:
        self.diagnostics.append(Diagnostic(code, message, Location("formula", node.span), severity))

    def formula(self, formula: Formula) -> None:
        match formula:
            case Eq(left, right):
                self.term(left)
                self.term(right)
            case Pred(name, args):
                self.predicate(formula, name, args)
            case Not(body):
                self.formula(body)
            case And(left, right) | Or(left, right) | Implies(left, right):
                self.formula(left)
                self.formula(right)
            case ForAll(var, body) | Exists(var, body):
                if var not in free_vars(body):
                    self.report(
                        "W-QNT-001",
                        f"La variable '{var}' no aparece libre en el alcance del cuantificador; "
                        "la cuantificación no tiene efecto.",
                        formula,
                        Severity.WARNING,
                    )
                self.formula(body)

    def predicate(self, node: Pred, name: str, args: tuple[Term, ...]) -> None:
        kind = self.signature.kind_of(name)
        if kind is None:
            self.report("E-SYM-001", f"El predicado '{name}' no está declarado.", node)
        elif kind is not SymbolKind.PREDICATE:
            self.report(
                "E-SYM-002",
                f"'{name}' está declarado como {kind.value}, pero se usa como predicado "
                "(una fórmula atómica necesita un predicado o una igualdad).",
                node,
            )
        else:
            self.arity(node, name, self.signature.predicates[name], len(args))
        for arg in args:
            self.term(arg)

    def term(self, term: Term) -> None:
        match term:
            case Var():
                pass
            case Const(name):
                kind = self.signature.kind_of(name)
                if kind is None:
                    self.report("E-SYM-001", f"El símbolo '{name}' no está declarado.", term)
                elif kind is SymbolKind.FUNCTION:
                    arity = self.signature.functions[name]
                    self.report(
                        "E-ARI-001",
                        f"El símbolo funcional '{name}' espera {_args(arity)}, pero se usó "
                        "sin argumentos.",
                        term,
                    )
                elif kind is SymbolKind.PREDICATE:
                    self.report(
                        "E-SYM-002",
                        f"'{name}' es un predicado y no puede usarse como término.",
                        term,
                    )
            case Func(name, args):
                kind = self.signature.kind_of(name)
                if kind is None:
                    self.report(
                        "E-SYM-001", f"El símbolo funcional '{name}' no está declarado.", term
                    )
                elif kind is SymbolKind.CONSTANT:
                    self.report(
                        "E-SYM-002",
                        f"'{name}' es una constante y no recibe argumentos.",
                        term,
                    )
                elif kind is SymbolKind.PREDICATE:
                    self.report(
                        "E-SYM-002",
                        f"'{name}' es un predicado y no puede usarse como término "
                        "(dentro de otro predicado o función).",
                        term,
                    )
                else:
                    self.arity(term, name, self.signature.functions[name], len(args))
                for arg in args:
                    self.term(arg)

    def arity(self, node: Term | Formula, name: str, expected: int, received: int) -> None:
        if expected != received:
            self.report(
                "E-ARI-001",
                f"'{name}' espera {_args(expected)}, pero recibió {received}.",
                node,
            )


def _args(n: int) -> str:
    return "1 argumento" if n == 1 else f"{n} argumentos"
