"""Juego semántico de Hintikka.

El verificador quiere mostrar que ℐ ⊨ₗ φ y el falsificador que ℐ ⊭ₗ φ. El
verificador tiene estrategia ganadora si y solo si ℐ ⊨ₗ φ.

| Fórmula | Quién mueve  | Jugada                              |
|---------|--------------|-------------------------------------|
| φ ∨ ψ   | verificador  | elige φ o ψ                         |
| φ ∧ ψ   | falsificador | elige φ o ψ                         |
| ∃x φ    | verificador  | elige a ∈ 𝒟 → l[x↦a]                |
| ∀x φ    | falsificador | elige a ∈ 𝒟 → l[x↦a]                |
| ¬φ      | —            | se intercambian los roles, sigue φ  |
| φ → ψ   | verificador  | elige ¬φ o ψ (como ¬φ ∨ ψ)          |
| atómica | —            | gana el verificador si es V         |
"""

from dataclasses import dataclass
from enum import StrEnum

from evaluador.core.environment import Environment
from evaluador.core.explain import sat
from evaluador.core.interpretation import Interpretation
from evaluador.core.printer import format_formula
from evaluador.core.semantics import satisfies
from evaluador.core.syntax_tree import And, Eq, Exists, ForAll, Formula, Implies, Not, Or, Pred

LEFT = "izquierda"
RIGHT = "derecha"

type Move = str  # LEFT o RIGHT en ∨, ∧, →; un elemento de 𝒟 en ∃, ∀


class InvalidMove(ValueError):
    pass


class Role(StrEnum):
    VERIFIER = "verificador"
    FALSIFIER = "falsificador"

    @property
    def opponent(self) -> "Role":
        return Role.FALSIFIER if self is Role.VERIFIER else Role.VERIFIER


class Player(StrEnum):
    USER = "usuario"
    MACHINE = "máquina"


@dataclass(frozen=True, slots=True)
class GameState:
    formula: Formula
    env: Environment
    user_role: Role

    def player(self, role: Role) -> Player:
        return Player.USER if role is self.user_role else Player.MACHINE


def initial_state(formula: Formula, env: Environment, user_role: Role) -> GameState:
    return _skip_negations(GameState(formula, env, user_role))


def turn(state: GameState) -> Player | None:
    """Quién mueve; None si la partida terminó."""
    match state.formula:
        case Or() | Implies() | Exists():
            return state.player(Role.VERIFIER)
        case And() | ForAll():
            return state.player(Role.FALSIFIER)
        case Not() | Eq() | Pred():
            return None


def legal_moves(state: GameState, interp: Interpretation) -> tuple[Move, ...]:
    match state.formula:
        case Or() | And() | Implies():
            return (LEFT, RIGHT)
        case Exists() | ForAll():
            return interp.domain
        case Not() | Eq() | Pred():
            return ()


def apply(state: GameState, move: Move, interp: Interpretation) -> GameState:
    if move not in legal_moves(state, interp):
        raise InvalidMove(f"'{move}' no es una jugada válida en esta posición.")
    return _skip_negations(_chosen(state, move))


def machine_move(state: GameState, interp: Interpretation) -> Move:
    """Estrategia ganadora: la primera jugada que deja ganando a la máquina."""
    moves = legal_moves(state, interp)
    for move in moves:
        if _winning_player(apply(state, move, interp), interp) is Player.MACHINE:
            return move
    return moves[0]


def winner(state: GameState, interp: Interpretation) -> Player | None:
    if not isinstance(state.formula, Eq | Pred):
        return None
    return _winning_player(state, interp)


def is_mistake(state: GameState, move: Move, interp: Interpretation) -> bool:
    """El usuario tenía estrategia ganadora y la pierde con esta jugada."""
    before = _winning_player(state, interp)
    after = _winning_player(apply(state, move, interp), interp)
    return before is Player.USER and after is Player.MACHINE


def move_label(state: GameState, move: Move) -> str:
    """Texto de la jugada: la subfórmula elegida o la asignación x ↦ a."""
    match state.formula:
        case Exists(var) | ForAll(var):
            return f"{var} ↦ {move}"
        case _:
            return format_formula(_chosen(state, move).formula)


def commentary(state: GameState, move: Move, interp: Interpretation) -> str:
    """Comentario sobre la jugada de quien tiene el turno."""
    label = move_label(state, move)
    if turn(state) is Player.USER:
        return f"Elegiste {label}."
    if _winning_player(apply(state, move, interp), interp) is Player.USER:
        return f"Ninguna opción me favorece; elijo {label}."
    chosen = _chosen(state, move)
    value = satisfies(chosen.formula, interp, chosen.env)
    return f"Elijo {label} porque {sat(chosen.env.label, chosen.formula, value)}."


def outcome(state: GameState, interp: Interpretation) -> str:
    """Por qué gana quien gana al llegar a una atómica."""
    value = satisfies(state.formula, interp, state.env)
    role = Role.VERIFIER if value else Role.FALSIFIER
    return f"{sat(state.env.label, state.formula, value)}: gana el {role}."


@dataclass(frozen=True, slots=True)
class TurnResult:
    state: GameState
    machine_move: str | None
    winner: Player | None
    mistake: bool
    commentary: str


def take_turn(state: GameState, move: Move | None, interp: Interpretation) -> TurnResult:
    """Una jugada por llamada: la del usuario si llega `move`; si no, la de la máquina."""
    player = turn(state)
    if player is None:
        if move is not None:
            raise InvalidMove("La partida ya terminó.")
        return TurnResult(state, None, winner(state, interp), False, outcome(state, interp))
    if move is None:
        if player is Player.USER:
            raise InvalidMove("Es tu turno: elige una jugada.")
        chosen = machine_move(state, interp)
        after = apply(state, chosen, interp)
        return TurnResult(
            after,
            move_label(state, chosen),
            winner(after, interp),
            False,
            commentary(state, chosen, interp),
        )
    if player is Player.MACHINE:
        raise InvalidMove("Es el turno de la máquina.")
    after = apply(state, move, interp)
    return TurnResult(
        after,
        None,
        winner(after, interp),
        is_mistake(state, move, interp),
        commentary(state, move, interp),
    )


def _chosen(state: GameState, move: Move) -> GameState:
    env, role = state.env, state.user_role
    match state.formula:
        case Or(left, right) | And(left, right):
            return GameState(left if move == LEFT else right, env, role)
        case Implies(left, right):
            return GameState(Not(left, left.span) if move == LEFT else right, env, role)
        case Exists(var, body) | ForAll(var, body):
            return GameState(body, env.update(var, move), role)
        case Not() | Eq() | Pred():
            raise InvalidMove("En esta posición nadie elige.")


def _skip_negations(state: GameState) -> GameState:
    while isinstance(state.formula, Not):
        state = GameState(state.formula.body, state.env, state.user_role.opponent)
    return state


def _winning_player(state: GameState, interp: Interpretation) -> Player:
    if satisfies(state.formula, interp, state.env):
        return state.player(Role.VERIFIER)
    return state.player(Role.FALSIFIER)
