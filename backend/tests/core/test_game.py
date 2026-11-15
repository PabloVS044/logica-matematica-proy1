import pytest

from evaluador.core.environment import Environment
from evaluador.core.game import (
    GameState,
    Player,
    Role,
    initial_state,
    turn,
)
from evaluador.core.parser import parse


def start(text: str, role: Role = Role.VERIFIER, **env: str) -> GameState:
    return initial_state(parse(text), Environment(env), role)


def test_opponent() -> None:
    assert Role.VERIFIER.opponent is Role.FALSIFIER
    assert Role.FALSIFIER.opponent is Role.VERIFIER


def test_player_depends_on_user_role() -> None:
    s = start("P(x)", Role.FALSIFIER, x="1")
    assert s.player(Role.FALSIFIER) is Player.USER
    assert s.player(Role.VERIFIER) is Player.MACHINE


@pytest.mark.parametrize(
    ("text", "role", "expected"),
    [
        ("P(x) ∨ P(y)", Role.VERIFIER, Player.USER),
        ("P(x) → P(y)", Role.VERIFIER, Player.USER),
        ("∃x P(x)", Role.VERIFIER, Player.USER),
        ("P(x) ∧ P(y)", Role.VERIFIER, Player.MACHINE),
        ("∀x P(x)", Role.VERIFIER, Player.MACHINE),
        ("∀x P(x)", Role.FALSIFIER, Player.USER),
        ("P(x)", Role.VERIFIER, None),
        ("x = y", Role.VERIFIER, None),
    ],
)
def test_turn(text: str, role: Role, expected: Player | None) -> None:
    assert turn(start(text, role)) is expected


def test_negation_swaps_roles() -> None:
    s = start("¬¬¬P(x)", Role.VERIFIER, x="1")
    assert s.formula == parse("P(x)")
    assert s.user_role is Role.FALSIFIER
