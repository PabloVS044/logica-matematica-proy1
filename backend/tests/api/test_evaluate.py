from typing import Any

import pytest
from fastapi.testclient import TestClient


def post(client: TestClient, project: dict[str, Any]) -> dict[str, Any]:
    response = client.post("/api/evaluate", json=project)
    assert response.status_code == 200
    data: dict[str, Any] = response.json()
    return data


def test_true_existential_with_witness(client: TestClient, project: dict[str, Any]) -> None:
    data = post(client, project)
    assert data["ok"] is True
    assert data["value"] is True
    root = data["explanation"]
    assert root["justification"] == "testigo"
    witness = [c for c in root["children"] if c["decisive"]]
    assert [c["binding"] for c in witness] == [{"var": "y", "value": "a"}]
    assert root["env_label"] == "l"
    assert witness[0]["env_label"] == "l[y↦a]"
    assert data["summary"].startswith("Verdadero.")


def test_false_universal_with_counterexample(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "∀x∀y∀z (Q(x,y) ∧ Q(x,z) → y = z)"
    data = post(client, project)
    assert data["value"] is False
    assert data["explanation"]["justification"] == "contraejemplo"
    assert "x ↦ a, y ↦ a, z ↦ b" in data["summary"]
    assert data["parenthesized"] == "∀x ∀y ∀z ((Q(x, y) ∧ Q(x, z)) → y = z)"


def test_atomic_node_has_computations(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "Q(i, i)"
    root = post(client, project)["explanation"]
    assert root["computations"] == ["⟦i⟧_{l} = iᴵ = a"]
    assert root["start"] == 0 and root["end"] == 7


def test_open_formula_with_environment(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "Q(x, y)"
    project["environment"] = {"x": "b", "y": "c"}
    data = post(client, project)
    assert data["value"] is True
    assert data["free_vars"] == ["x", "y"]
    assert data["explanation"]["env"] == [{"var": "x", "value": "b"}, {"var": "y", "value": "c"}]


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"formula": "Q(i, y"}, "E-SYN-002"),
        ({"formula": "Q(i)"}, "E-ARI-001"),
        ({"formula": "S(i)"}, "E-SYM-001"),
        ({"formula": "Q(x, y)"}, "E-ENV-001"),
        ({"formula": "Q(x, x)", "environment": {"x": "z"}}, "E-ENV-002"),
    ],
)
def test_invalid_input_never_gets_a_truth_value(
    client: TestClient, project: dict[str, Any], change: dict[str, Any], code: str
) -> None:
    project.update(change)
    data = post(client, project)
    assert data["ok"] is False
    assert data["value"] is None
    assert data["summary"] is None
    assert data["explanation"] is None
    assert code in [d["code"] for d in data["diagnostics"]]


@pytest.mark.parametrize(
    ("path", "value", "code"),
    [
        (("interpretation", "domain"), [], "E-DOM-001"),
        (("interpretation", "constants"), {}, "E-CON-001"),
        (("interpretation", "predicates"), {"R": [], "Q": [["a", "a"]]}, "E-REL-001"),
        (("language", "constants"), ["x"], "E-LNG-001"),
    ],
)
def test_invalid_interpretation_or_language_gets_no_value(
    client: TestClient, project: dict[str, Any], path: tuple[str, str], value: Any, code: str
) -> None:
    project[path[0]][path[1]] = value
    data = post(client, project)
    assert data["value"] is None
    assert code in [d["code"] for d in data["diagnostics"]]


def test_function_table_errors_have_paths(client: TestClient, project: dict[str, Any]) -> None:
    project["language"]["functions"] = [{"name": "f", "arity": 1}]
    project["interpretation"]["functions"] = {"f": [{"args": ["a"], "value": "b"}]}
    data = post(client, project)
    missing = [d for d in data["diagnostics"] if d["code"] == "E-FUN-001"]
    assert [d["location"]["path"] for d in missing] == [["f", "b"], ["f", "c"]]


def test_syntax_error_location(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "Q(i, i) ∧ ∧ R(i)"
    (diagnostic,) = post(client, project)["diagnostics"]
    assert diagnostic["severity"] == "error"
    assert diagnostic["location"] == {"kind": "formula", "start": 10, "end": 11, "path": []}


def test_warnings_are_returned_with_value(client: TestClient, project: dict[str, Any]) -> None:
    project["formula"] = "∀x R(i) ∨ ¬R(i)"
    data = post(client, project)
    assert data["ok"] is True
    assert [d["code"] for d in data["diagnostics"]] == ["W-QNT-001"]
    assert data["diagnostics"][0]["severity"] == "warning"


def test_large_explanations_are_truncated(client: TestClient) -> None:
    domain = [str(i) for i in range(30)]
    project = {
        "language": {"predicates": [{"name": "P", "arity": 1}]},
        "interpretation": {"domain": domain, "predicates": {"P": [["0"]]}},
        "formula": "∀x ∀y ∀z (P(x) ∨ P(y) ∨ P(z) ∨ ¬P(x))",
    }
    data = post(client, project)
    assert data["value"] is True
    assert data["truncated"] is True


def test_malformed_request_is_rejected(client: TestClient) -> None:
    response = client.post("/api/evaluate", json={"language": {"functions": [{"name": "f"}]}})
    assert response.status_code == 422
