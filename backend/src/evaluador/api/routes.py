"""Rutas HTTP. No contienen lógica: validan la forma, llaman al núcleo y traducen."""

from fastapi import APIRouter, HTTPException

from evaluador import __version__
from evaluador.api.examples import load_examples
from evaluador.api.mappers import (
    diagnostics_out,
    explanation_out,
    game_move_out,
    game_state_out,
    occurrence_out,
    syntax_tree_out,
    to_declarations,
    to_environment,
    to_raw_interpretation,
)
from evaluador.api.schemas import (
    CommandIn,
    CommandOut,
    DiagnosticsOut,
    EvaluationOut,
    ExampleOut,
    FormulaAnalysisOut,
    FormulaIn,
    GameMoveIn,
    GameMoveOut,
    GameStartIn,
    GameStateOut,
    HealthOut,
    InterpretationRequest,
    LanguageIn,
    ProjectIn,
    SpeechIn,
    SpeechMarkOut,
    SpeechTranslationOut,
)
from evaluador.core.analysis import analyze_formula
from evaluador.core.errors import Span, has_errors
from evaluador.core.evaluation import ValidInput, evaluate, validate
from evaluador.core.game import (
    InvalidMove,
    InvalidState,
    Role,
    initial_state,
    restore_state,
    take_turn,
)
from evaluador.core.interpretation import build_interpretation
from evaluador.core.language import build_signature
from evaluador.core.printer import format_formula
from evaluador.core.speech import detect_command, translate
from evaluador.core.spoken import spoken_verdict
from evaluador.core.verbalize import verbalize

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
        spoken=verbalize(analysis.formula, spell=True) if analysis.formula else None,
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
        spoken_summary=spoken_verdict(explanation.root),
        explanation=explanation_out(explanation.root),
        truncated=explanation.truncated,
        node_count=explanation.node_count,
        free_vars=list(result.free_vars),
        parenthesized=result.parenthesized,
    )


@router.post("/speech/translate")
def speech_translate(request: SpeechIn) -> SpeechTranslationOut:
    """Traduce una transcripción en español hablado a una fórmula del lenguaje."""
    language = build_signature(*to_declarations(request.language))
    if language.signature is None:
        return SpeechTranslationOut(ok=False, diagnostics=diagnostics_out(language.diagnostics))
    result = translate(request.transcript, language.signature)
    marks = [
        SpeechMarkOut(
            text=m.text, start=m.span.start, end=m.span.end, role=m.role.value, meaning=m.meaning
        )
        for m in result.marks
    ]
    if result.formula is None:
        return SpeechTranslationOut(
            ok=False, diagnostics=diagnostics_out(result.diagnostics), marks=marks
        )
    return SpeechTranslationOut(
        ok=True,
        diagnostics=[],
        formula=result.text,
        parenthesized=format_formula(result.formula, full_parens=True),
        spoken=verbalize(result.formula, spell=True),
        marks=marks,
    )


@router.post("/speech/command")
def speech_command(request: CommandIn) -> CommandOut:
    """Reconoce comandos de voz: "borra eso", "borra todo", "listo", "evaluar", "cancelar"."""
    command = detect_command(request.utterance)
    return CommandOut(command=command.value if command else None)


@router.get("/examples")
def list_examples() -> list[ExampleOut]:
    return load_examples()


@router.get("/examples/{example_id}")
def get_example(example_id: str) -> ExampleOut:
    for example in load_examples():
        if example.id == example_id:
            return example
    raise HTTPException(status_code=404, detail=f"No existe el ejemplo '{example_id}'.")


@router.post("/game/start")
def game_start(request: GameStartIn) -> GameStateOut:
    valid = _valid_project(request.project)
    state = initial_state(valid.formula, valid.environment, Role(request.user_role))
    return game_state_out(state, request.project, valid.interpretation)


@router.post("/game/move")
def game_move(request: GameMoveIn) -> GameMoveOut:
    sent = request.state
    valid = _valid_project(sent.project)
    try:
        state = restore_state(
            valid.formula,
            Span(sent.start, sent.end),
            to_environment(sent),
            Role(sent.user_role),
            valid.interpretation,
        )
        result = take_turn(state, request.move, valid.interpretation)
    except (InvalidState, InvalidMove) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return game_move_out(result, sent.project, valid.interpretation)


def _valid_project(project: ProjectIn) -> ValidInput:
    """Jugar revela el valor de verdad: con errores en la entrada no se juega."""
    constants, functions, predicates = to_declarations(project.language)
    checked = validate(
        constants=constants,
        functions=functions,
        predicates=predicates,
        interpretation=to_raw_interpretation(project.interpretation),
        formula=project.formula,
        environment=project.environment,
    )
    if checked.valid is None:
        raise HTTPException(
            status_code=422, detail="El proyecto tiene errores; corrígelos antes de jugar."
        )
    return checked.valid
