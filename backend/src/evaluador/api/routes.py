"""Rutas HTTP. No contienen lógica: validan la forma, llaman al núcleo y traducen."""

from fastapi import APIRouter, HTTPException

from evaluador import __version__
from evaluador.api.examples import load_examples
from evaluador.api.mappers import (
    diagnostics_out,
    explanation_out,
    occurrence_out,
    syntax_tree_out,
    to_declarations,
    to_raw_interpretation,
)
from evaluador.api.schemas import (
    DiagnosticsOut,
    EvaluationOut,
    ExampleOut,
    FormulaAnalysisOut,
    FormulaIn,
    HealthOut,
    InterpretationRequest,
    LanguageIn,
    ProjectIn,
)
from evaluador.core.analysis import analyze_formula
from evaluador.core.errors import has_errors
from evaluador.core.evaluation import evaluate
from evaluador.core.interpretation import build_interpretation
from evaluador.core.language import build_signature

# Límite de nodos de la explicación enviada al navegador (el valor siempre es exacto).
API_NODE_BUDGET = 10_000

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> HealthOut:
    return HealthOut(status="ok", version=__version__)


@router.post("/language/validate")
def validate_language(language: LanguageIn) -> DiagnosticsOut:
    result = build_signature(*to_declarations(language))
    return DiagnosticsOut(
        ok=not has_errors(result.diagnostics), diagnostics=diagnostics_out(result.diagnostics)
    )


@router.post("/formula/analyze")
def analyze(request: FormulaIn) -> FormulaAnalysisOut:
    language = build_signature(*to_declarations(request.language))
    if language.signature is None:
        return FormulaAnalysisOut(ok=False, diagnostics=diagnostics_out(language.diagnostics))
    analysis = analyze_formula(request.formula, language.signature)
    return FormulaAnalysisOut(
        ok=analysis.ok,
        diagnostics=diagnostics_out(analysis.diagnostics),
        parenthesized=analysis.parenthesized,
        free_vars=analysis.free_vars,
        occurrences=[occurrence_out(o) for o in analysis.occurrences],
        syntax_tree=syntax_tree_out(analysis.formula) if analysis.formula else None,
    )


@router.post("/interpretation/validate")
def validate_interpretation(request: InterpretationRequest) -> DiagnosticsOut:
    language = build_signature(*to_declarations(request.language))
    if language.signature is None:
        return DiagnosticsOut(ok=False, diagnostics=diagnostics_out(language.diagnostics))
    result = build_interpretation(to_raw_interpretation(request.interpretation), language.signature)
    return DiagnosticsOut(
        ok=result.interpretation is not None, diagnostics=diagnostics_out(result.diagnostics)
    )


@router.post("/evaluate")
def evaluate_project(project: ProjectIn) -> EvaluationOut:
    constants, functions, predicates = to_declarations(project.language)
    result = evaluate(
        constants=constants,
        functions=functions,
        predicates=predicates,
        interpretation=to_raw_interpretation(project.interpretation),
        formula=project.formula,
        environment=project.environment,
        node_budget=API_NODE_BUDGET,
    )
    diagnostics = diagnostics_out(result.diagnostics)
    if result.value is None or result.explanation is None:
        # Entradas inválidas nunca reciben valor de verdad.
        return EvaluationOut(
            ok=False,
            diagnostics=diagnostics,
            free_vars=list(result.free_vars),
            parenthesized=result.parenthesized,
        )
    explanation = result.explanation
    return EvaluationOut(
        ok=True,
        diagnostics=diagnostics,
        value=result.value,
        summary=explanation.summary,
        explanation=explanation_out(explanation.root),
        truncated=explanation.truncated,
        node_count=explanation.node_count,
        free_vars=list(result.free_vars),
        parenthesized=result.parenthesized,
    )


@router.get("/examples")
def list_examples() -> list[ExampleOut]:
    return load_examples()


@router.get("/examples/{example_id}")
def get_example(example_id: str) -> ExampleOut:
    for example in load_examples():
        if example.id == example_id:
            return example
    raise HTTPException(status_code=404, detail=f"No existe el ejemplo '{example_id}'.")
