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
from evaluador.core.interpretation import Interpretation
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


def winner(state: GameState, interp: Interpretation) -> Player | None:
    if not isinstance(state.formula, Eq | Pred):
        return None
    return _winning_player(state, interp)


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
