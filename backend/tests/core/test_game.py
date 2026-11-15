import pytest

from evaluador.core.environment import Environment
from evaluador.core.game import (
    LEFT,
    RIGHT,
    GameState,
    InvalidMove,
    Player,
    Role,
    apply,
    initial_state,
    legal_moves,
    turn,
)
from evaluador.core.interpretation import Interpretation
from evaluador.core.parser import parse

# Slides 10: 𝒟 = {1, 2, 3}, Pᴵ = {1, 2}, Rᴵ = {(1, 3), (2, 1), (3, 2)}
SLIDES10 = Interpretation(
    domain=("1", "2", "3"),
    constants={},
    functions={},
    predicates={
        "P": frozenset({("1",), ("2",)}),
        "R": frozenset({("1", "3"), ("2", "1"), ("3", "2")}),
    },
)


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


def test_legal_moves() -> None:
    assert legal_moves(start("P(x) ∨ P(y)"), SLIDES10) == (LEFT, RIGHT)
    assert legal_moves(start("P(x) ∧ P(y)"), SLIDES10) == (LEFT, RIGHT)
    assert legal_moves(start("P(x) → P(y)"), SLIDES10) == (LEFT, RIGHT)
    assert legal_moves(start("∃x P(x)"), SLIDES10) == ("1", "2", "3")
    assert legal_moves(start("∀x P(x)"), SLIDES10) == ("1", "2", "3")
    assert legal_moves(start("P(x)", x="1"), SLIDES10) == ()


@pytest.mark.parametrize("text", ["P(x) ∨ R(x, y)", "P(x) ∧ R(x, y)"])
def test_apply_side(text: str) -> None:
    s = start(text, x="1", y="2")
    assert apply(s, LEFT, SLIDES10) == GameState(parse("P(x)"), s.env, Role.VERIFIER)
    assert apply(s, RIGHT, SLIDES10) == GameState(parse("R(x, y)"), s.env, Role.VERIFIER)


@pytest.mark.parametrize("text", ["∃x R(x, y)", "∀x R(x, y)"])
def test_apply_element(text: str) -> None:
    nxt = apply(start(text, y="2"), "3", SLIDES10)
    assert nxt.formula == parse("R(x, y)")
    assert nxt.env.values == {"y": "2", "x": "3"}
    assert nxt.env.label == "l[x↦3]"


def test_negation_swaps_roles() -> None:
    s = start("¬¬¬P(x)", Role.VERIFIER, x="1")
    assert s.formula == parse("P(x)")
    assert s.user_role is Role.FALSIFIER


def test_implication_is_played_as_disjunction() -> None:
    s = start("P(x) → R(x, y)", Role.VERIFIER, x="1", y="2")
    assert apply(s, LEFT, SLIDES10) == GameState(parse("P(x)"), s.env, Role.FALSIFIER)
    assert apply(s, RIGHT, SLIDES10) == GameState(parse("R(x, y)"), s.env, Role.VERIFIER)


@pytest.mark.parametrize(("text", "move"), [("∃x P(x)", "4"), ("P(x) ∨ P(y)", "1"), ("P(x)", LEFT)])
def test_invalid_move(text: str, move: str) -> None:
    with pytest.raises(InvalidMove):
        apply(start(text, x="1", y="1"), move, SLIDES10)
