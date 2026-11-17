from typing import Any

import pytest
from fastapi.testclient import TestClient


def start(client: TestClient, project: dict[str, Any], role: str) -> dict[str, Any]:
    response = client.post("/api/game/start", json={"project": project, "user_role": role})
    assert response.status_code == 200
    data: dict[str, Any] = response.json()
    return data


def move(client: TestClient, state: dict[str, Any], choice: str | None = None) -> dict[str, Any]:
    response = client.post("/api/game/move", json={"state": state, "move": choice})
    assert response.status_code == 200
    data: dict[str, Any] = response.json()
    return data


def test_start(client: TestClient, project: dict[str, Any]) -> None:
    state = start(client, project, "verificador")
    assert state["formula"] == "∃y Q(i, y)"
    assert (state["start"], state["end"]) == (0, 10)
    assert state["environment"] == {}
    assert state["env_label"] == "l"
    assert state["user_role"] == "verificador"
    assert state["turn"] == "usuario"
    assert state["options"] == [
        {"move": "a", "label": "y ↦ a"},
        {"move": "b", "label": "y ↦ b"},
        {"move": "c", "label": "y ↦ c"},
    ]


def test_user_move(client: TestClient, project: dict[str, Any]) -> None:
    data = move(client, start(client, project, "verificador"), "a")
    assert data["machine_move"] is None
    assert data["finished"] is True
    assert data["winner"] == "usuario"
    assert data["mistake"] is False
    assert data["commentary"] == "Elegiste y ↦ a."
    state = data["state"]
    assert state["formula"] == "Q(i, y)"
    assert state["environment"] == {"y": "a"}
    assert state["env_label"] == "l[y↦a]"
    assert state["turn"] is None
    assert state["options"] == []


def test_machine_move(client: TestClient, project: dict[str, Any]) -> None:
    state = start(client, project, "falsificador")
    assert state["turn"] == "máquina"
    data = move(client, state)
    assert data["machine_move"] == "y ↦ a"
    assert data["commentary"] == "Elijo y ↦ a porque ℐ ⊨_{l[y↦a]} Q(i, y)."
    assert data["winner"] == "máquina"


def test_machine_moves_twice_in_a_row(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "∃x ∃y Q(x, y)"
    first = move(client, start(client, project, "falsificador"))
    assert first["machine_move"] == "x ↦ a"
    assert first["finished"] is False
    assert first["state"]["turn"] == "máquina"
    second = move(client, first["state"])
    assert second["machine_move"] == "y ↦ a"
    assert second["winner"] == "máquina"


def test_mistake(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "∀x R(x)"
    data = move(client, start(client, project, "falsificador"), "b")
    assert data["winner"] == "máquina"
    assert data["mistake"] is True


def test_negation_swaps_roles(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "¬R(i)"
    state = start(client, project, "verificador")
    assert state["formula"] == "R(i)"
    assert state["user_role"] == "falsificador"
    assert state["turn"] is None
    data = move(client, state)
    assert data["winner"] == "usuario"
    assert data["commentary"] == "ℐ ⊭_{l} R(i): gana el falsificador."


def test_open_formula_uses_environment(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "∃y Q(x, y)"
    project["environment"] = {"x": "b"}
    state = start(client, project, "verificador")
    assert state["environment"] == {"x": "b"}
    assert move(client, state, "c")["winner"] == "usuario"
    assert move(client, state, "a")["mistake"] is True


def test_invalid_project_cannot_be_played(client: TestClient, project: dict[str, Any]) -> None:
    state = start(client, project, "verificador")
    project["formula"] = "∃y Q(i)"
    response = client.post("/api/game/start", json={"project": project, "user_role": "verificador"})
    assert response.status_code == 422
    state["project"] = project
    response = client.post("/api/game/move", json={"state": state, "move": "a"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("role", "changes", "choice"),
    [
        ("verificador", {}, "z"),
        ("verificador", {}, None),
        ("falsificador", {}, "a"),
        ("verificador", {"start": 1}, "a"),
        ("verificador", {"environment": {"y": "z"}}, "a"),
    ],
)
def test_invalid_moves(
    client: TestClient,
    project: dict[str, Any],
    role: str,
    changes: dict[str, Any],
    choice: str | None,
) -> None:
    state = start(client, project, role) | changes
    response = client.post("/api/game/move", json={"state": state, "move": choice})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("formula", "kind", "variable", "body"),
    [
        ("∃yQ(i, y)", "existe", "y", "Q(i, y)"),
        ("∀x(R(x) → Q(i, x))", "para todo", "x", "R(x) → Q(i, x)"),
        ("R(i) ∨ R(i)", "o", None, None),
        ("R(i) ∧ R(i)", "y", None, None),
        ("R(i) → R(i)", "implica", None, None),
        ("¬R(i)", "atómica", None, None),
    ],
)
def test_state_describes_the_kind_of_formula(
    client: TestClient,
    project: dict[str, Any],
    formula: str,
    kind: str,
    variable: str | None,
    body: str | None,
) -> None:
    project["formula"] = formula
    state = client.post(
        "/api/game/start", json={"project": project, "user_role": "verificador"}
    ).json()
    assert (state["kind"], state["variable"], state["body"]) == (kind, variable, body)
