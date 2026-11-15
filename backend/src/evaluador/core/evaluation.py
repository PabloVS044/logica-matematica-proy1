"""Punto de entrada del evaluador: valida todo por fases y, solo si no hay errores, evalúa.

Fases: lenguaje → fórmula (sintaxis, símbolos, aridades) e interpretación →
entorno → evaluación. Una entrada con errores nunca recibe valor de verdad.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from evaluador.core.analysis import analyze_formula
from evaluador.core.environment import Environment, build_environment
from evaluador.core.errors import Diagnostic, has_errors
from evaluador.core.explain import DEFAULT_NODE_BUDGET, Explanation, explain
from evaluador.core.interpretation import (
    Interpretation,
    RawInterpretation,
    build_interpretation,
)
from evaluador.core.language import SymbolDecl, build_signature
from evaluador.core.syntax_tree import Formula


@dataclass(frozen=True, slots=True)
class ValidInput:
    formula: Formula
    interpretation: Interpretation
    environment: Environment


@dataclass(frozen=True, slots=True)
class ValidationResult:
    diagnostics: list[Diagnostic]
    valid: ValidInput | None = None
    free_vars: tuple[str, ...] = ()
    parenthesized: str | None = None


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    diagnostics: list[Diagnostic]
    value: bool | None = None
    explanation: Explanation | None = None
    free_vars: tuple[str, ...] = ()
    parenthesized: str | None = None

    @property
    def ok(self) -> bool:
        return self.value is not None


def validate(
    *,
    constants: Sequence[str],
    functions: Sequence[SymbolDecl],
    predicates: Sequence[SymbolDecl],
    interpretation: RawInterpretation,
    formula: str,
    environment: Mapping[str, str],
) -> ValidationResult:
    language = build_signature(constants, functions, predicates)
    if language.signature is None:
        return ValidationResult(language.diagnostics)
    signature = language.signature

    analysis = analyze_formula(formula, signature)
    interp_result = build_interpretation(interpretation, signature)
    diagnostics = [*analysis.diagnostics, *interp_result.diagnostics]
    free_vars = tuple(analysis.free_vars)
    if analysis.formula is None or interp_result.interpretation is None or has_errors(diagnostics):
        return ValidationResult(
            diagnostics, free_vars=free_vars, parenthesized=analysis.parenthesized
        )
    interp = interp_result.interpretation

    env_result = build_environment(environment, analysis.free_vars, interp.domain)
    diagnostics += env_result.diagnostics
    if env_result.environment is None:
        return ValidationResult(
            diagnostics, free_vars=free_vars, parenthesized=analysis.parenthesized
        )

    return ValidationResult(
        diagnostics,
        ValidInput(analysis.formula, interp, env_result.environment),
        free_vars=free_vars,
        parenthesized=analysis.parenthesized,
    )


def evaluate(
    *,
    constants: Sequence[str],
    functions: Sequence[SymbolDecl],
    predicates: Sequence[SymbolDecl],
    interpretation: RawInterpretation,
    formula: str,
    environment: Mapping[str, str],
    node_budget: int = DEFAULT_NODE_BUDGET,
) -> EvaluationResult:
    checked = validate(
        constants=constants,
        functions=functions,
        predicates=predicates,
        interpretation=interpretation,
        formula=formula,
        environment=environment,
    )
    if checked.valid is None:
        return EvaluationResult(
            checked.diagnostics, free_vars=checked.free_vars, parenthesized=checked.parenthesized
        )
    valid = checked.valid

    explanation = explain(
        valid.formula, valid.interpretation, valid.environment, node_budget=node_budget
    )
    return EvaluationResult(
        checked.diagnostics,
        value=explanation.root.value,
        explanation=explanation,
        free_vars=checked.free_vars,
        parenthesized=checked.parenthesized,
    )
