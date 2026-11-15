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
from evaluador.core.syntax_tree import And, Eq, Exists, ForAll, Formula, Implies, Not, Or, Pred


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


def _skip_negations(state: GameState) -> GameState:
    while isinstance(state.formula, Not):
        state = GameState(state.formula.body, state.env, state.user_role.opponent)
    return state
