"""Conversión entre los esquemas de la API y los tipos del núcleo."""

import itertools
from collections.abc import Iterator

from evaluador.api.schemas import (
    AtomOut,
    BindingOut,
    DiagnosticOut,
    ExplainNodeOut,
    GameMoveOut,
    GameOptionOut,
    GameStateIn,
    GameStateOut,
    InterpretationIn,
    LanguageIn,
    LocationOut,
    OccurrenceOut,
    ProjectIn,
    SyntaxKind,
    SyntaxNodeOut,
)
from evaluador.core.environment import Environment
from evaluador.core.errors import Diagnostic
from evaluador.core.explain import ExplainNode
from evaluador.core.freevars import VarOccurrence
from evaluador.core.game import GameState, TurnResult, legal_moves, move_label, turn
from evaluador.core.interpretation import FunctionRow, Interpretation, RawInterpretation
from evaluador.core.language import SymbolDecl
from evaluador.core.printer import format_formula, format_term
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
from evaluador.core.verbalize import verbalize

# ------------------------------------------------------------------ entrada


def to_declarations(
    language: LanguageIn,
) -> tuple[list[str], list[SymbolDecl], list[SymbolDecl]]:
    """(constantes, funciones, predicados) en los tipos del núcleo."""
    return (
        list(language.constants),
        [SymbolDecl(d.name, d.arity) for d in language.functions],
        [SymbolDecl(d.name, d.arity) for d in language.predicates],
    )


def to_raw_interpretation(interp: InterpretationIn) -> RawInterpretation:
    return RawInterpretation(
        domain=list(interp.domain),
        constants=dict(interp.constants),
        functions={
            name: [FunctionRow(tuple(row.args), row.value) for row in rows]
            for name, rows in interp.functions.items()
        },
        predicates={name: [tuple(row) for row in rows] for name, rows in interp.predicates.items()},
    )


def to_environment(state: GameStateIn) -> Environment:
    return Environment(dict(state.environment), state.env_label)


# ------------------------------------------------------------------ salida


def diagnostic_out(diagnostic: Diagnostic) -> DiagnosticOut:
    location = diagnostic.location
    return DiagnosticOut(
        code=diagnostic.code,
        severity=diagnostic.severity.value,
        message=diagnostic.message,
        location=LocationOut(
            kind=location.kind,
            start=location.span.start if location.span else None,
            end=location.span.end if location.span else None,
            path=list(location.path),
        ),
    )


def diagnostics_out(diagnostics: list[Diagnostic]) -> list[DiagnosticOut]:
    return [diagnostic_out(d) for d in diagnostics]


def occurrence_out(occurrence: VarOccurrence) -> OccurrenceOut:
    return OccurrenceOut(
        name=occurrence.name,
        start=occurrence.span.start,
        end=occurrence.span.end,
        free=occurrence.is_free,
        binder_start=occurrence.binder.start if occurrence.binder else None,
        binder_end=occurrence.binder.end if occurrence.binder else None,
    )


def syntax_tree_out(formula: Formula) -> SyntaxNodeOut:
    return _formula_node(formula, _ids())


def explanation_out(root: ExplainNode) -> ExplainNodeOut:
    return _explain_node(root, _ids())


def _ids() -> Iterator[str]:
    return (f"n{i}" for i in itertools.count())


def _term_node(term: Term, ids: Iterator[str]) -> SyntaxNodeOut:
    span = term.span
    kind: SyntaxKind
    children: list[SyntaxNodeOut]
    match term:
        case Var(name):
            kind, children = "var", []
        case Const(name):
            kind, children = "const", []
        case Func(name, args):
            kind, children = "func", [_term_node(arg, ids) for arg in args]
    return SyntaxNodeOut(
        id=next(ids),
        kind=kind,
        label=name,
        text=format_term(term),
        start=span.start,
        end=span.end,
        children=children,
    )


def _formula_node(formula: Formula, ids: Iterator[str]) -> SyntaxNodeOut:
    node_id = next(ids)
    kind: SyntaxKind
    children: list[SyntaxNodeOut]
    match formula:
        case Eq(left, right):
            kind, label = "eq", "="
            children = [_term_node(left, ids), _term_node(right, ids)]
        case Pred(name, args):
            kind, label = "pred", name
            children = [_term_node(arg, ids) for arg in args]
        case Not(body):
            kind, label = "not", "¬"
            children = [_formula_node(body, ids)]
        case And(left, right):
            kind, label = "and", "∧"
            children = [_formula_node(left, ids), _formula_node(right, ids)]
        case Or(left, right):
            kind, label = "or", "∨"
            children = [_formula_node(left, ids), _formula_node(right, ids)]
        case Implies(left, right):
            kind, label = "implies", "→"
            children = [_formula_node(left, ids), _formula_node(right, ids)]
        case ForAll(var, body):
            kind, label = "forall", f"∀{var}"
            children = [_formula_node(body, ids)]
        case Exists(var, body):
            kind, label = "exists", f"∃{var}"
            children = [_formula_node(body, ids)]
    return SyntaxNodeOut(
        id=node_id,
        kind=kind,
        label=label,
        text=format_formula(formula),
        start=formula.span.start,
        end=formula.span.end,
        children=children,
    )


def _explain_node(node: ExplainNode, ids: Iterator[str]) -> ExplainNodeOut:
    node_id = next(ids)
    return ExplainNodeOut(
        id=node_id,
        formula=format_formula(node.formula),
        start=node.formula.span.start,
        end=node.formula.span.end,
        env_label=node.env_label,
        env=[BindingOut(var=var, value=value) for var, value in node.env],
        value=node.value,
        rule=node.rule.value,
        reason=node.reason,
        decisive=node.decisive,
        justification=node.justification.value if node.justification else None,
        binding=BindingOut(var=node.binding[0], value=node.binding[1]) if node.binding else None,
        computations=list(node.computations),
        atom=AtomOut(symbol=node.atom[0], args=list(node.atom[1])) if node.atom else None,
        spoken=verbalize(node.formula, spell=True),
        pruned=node.pruned,
        children=[_explain_node(child, ids) for child in node.children],
    )


def game_state_out(state: GameState, project: ProjectIn, interp: Interpretation) -> GameStateOut:
    player = turn(state)
    return GameStateOut(
        project=project,
        start=state.formula.span.start,
        end=state.formula.span.end,
        environment=dict(state.env.values),
        env_label=state.env.label,
        user_role=state.user_role.value,
        formula=format_formula(state.formula),
        turn=player.value if player is not None else None,
        options=[
            GameOptionOut(move=move, label=move_label(state, move))
            for move in legal_moves(state, interp)
        ],
    )


def game_move_out(result: TurnResult, project: ProjectIn, interp: Interpretation) -> GameMoveOut:
    return GameMoveOut(
        state=game_state_out(result.state, project, interp),
        machine_move=result.machine_move,
        finished=result.winner is not None,
        winner=result.winner.value if result.winner is not None else None,
        commentary=result.commentary,
        mistake=result.mistake,
    )
