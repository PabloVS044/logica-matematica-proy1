"""Análisis completo de una fórmula: sintaxis + símbolos + variables libres."""

from dataclasses import dataclass

from evaluador.core.check import check_formula
from evaluador.core.errors import Diagnostic, has_errors
from evaluador.core.freevars import VarOccurrence, occurrences, ordered_free_vars
from evaluador.core.language import Signature
from evaluador.core.parser import parse_formula
from evaluador.core.printer import format_formula
from evaluador.core.syntax_tree import Formula


@dataclass(frozen=True, slots=True)
class FormulaAnalysis:
    formula: Formula | None
    diagnostics: list[Diagnostic]
    parenthesized: str | None
    free_vars: list[str]
    occurrences: list[VarOccurrence]

    @property
    def ok(self) -> bool:
        return self.formula is not None and not has_errors(self.diagnostics)


def analyze_formula(text: str, signature: Signature) -> FormulaAnalysis:
    parsed = parse_formula(text)
    if parsed.formula is None:
        return FormulaAnalysis(None, parsed.diagnostics, None, [], [])
    formula = parsed.formula
    return FormulaAnalysis(
        formula=formula,
        diagnostics=check_formula(formula, signature),
        parenthesized=format_formula(formula, full_parens=True),
        free_vars=ordered_free_vars(formula),
        occurrences=occurrences(formula),
    )
