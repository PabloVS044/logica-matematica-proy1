from typing import Any

from fastapi.testclient import TestClient


def test_validate_language(client: TestClient) -> None:
    response = client.post(
        "/api/language/validate",
        json={"constants": ["a", "a"], "predicates": [{"name": "P", "arity": 0}]},
    )
    data = response.json()
    assert data["ok"] is False
    assert [d["code"] for d in data["diagnostics"]] == ["E-LNG-002", "E-LNG-003"]
    assert data["diagnostics"][0]["location"]["path"] == ["constante", 1]


def test_validate_language_ok(client: TestClient) -> None:
    data = client.post("/api/language/validate", json={"constants": ["c"]}).json()
    assert data == {"ok": True, "diagnostics": []}


def test_analyze_formula(client: TestClient, project: dict[str, Any]) -> None:
    request = {"language": project["language"], "formula": "∀x (R(x) → Q(x, y))"}
    data = client.post("/api/formula/analyze", json=request).json()
    assert data["ok"] is True
    assert data["free_vars"] == ["y"]
    assert data["parenthesized"] == "∀x (R(x) → Q(x, y))"
    occurrences = data["occurrences"]
    assert [(o["name"], o["free"]) for o in occurrences] == [
        ("x", False),
        ("x", False),
        ("y", True),
    ]
    assert occurrences[0]["binder_start"] == 0


def test_analyze_returns_syntax_tree(client: TestClient, project: dict[str, Any]) -> None:
    request = {"language": project["language"], "formula": "¬Q(i, x)"}
    tree = client.post("/api/formula/analyze", json=request).json()["syntax_tree"]
    assert (tree["kind"], tree["label"], tree["text"]) == ("not", "¬", "¬Q(i, x)")
    (pred,) = tree["children"]
    assert (pred["kind"], pred["label"]) == ("pred", "Q")
    assert [(c["kind"], c["label"]) for c in pred["children"]] == [("const", "i"), ("var", "x")]
    ids = [tree["id"], pred["id"], *(c["id"] for c in pred["children"])]
    assert len(set(ids)) == 4


def test_analyze_with_symbol_errors_keeps_tree(client: TestClient, project: dict[str, Any]) -> None:
    request = {"language": project["language"], "formula": "Q(i)"}
    data = client.post("/api/formula/analyze", json=request).json()
    assert data["ok"] is False
    assert data["syntax_tree"] is not None


def test_analyze_with_invalid_language(client: TestClient) -> None:
    request = {"language": {"constants": ["forall"]}, "formula": "P(x)"}
    data = client.post("/api/formula/analyze", json=request).json()
    assert data["ok"] is False
    assert data["syntax_tree"] is None


def test_validate_interpretation(client: TestClient, project: dict[str, Any]) -> None:
    request = {"language": project["language"], "interpretation": project["interpretation"]}
    assert client.post("/api/interpretation/validate", json=request).json()["ok"] is True
    request["interpretation"]["domain"] = ["a", "a"]
    data = client.post("/api/interpretation/validate", json=request).json()
    assert data["ok"] is False
    assert data["diagnostics"][0]["location"] == {
        "kind": "domain",
        "start": None,
        "end": None,
        "path": [1],
    }


def test_validate_interpretation_with_invalid_language(client: TestClient) -> None:
    request = {"language": {"constants": ["x"]}, "interpretation": {"domain": ["a"]}}
    data = client.post("/api/interpretation/validate", json=request).json()
    assert [d["code"] for d in data["diagnostics"]] == ["E-LNG-001"]


def test_syntax_tree_covers_every_node_kind(client: TestClient) -> None:
    language = {
        "constants": ["c"],
        "functions": [{"name": "f", "arity": 1}],
        "predicates": [{"name": "P", "arity": 1}],
    }
    formula = "∀x (P(x) ∧ ∃y f(y) = c) ∨ (P(c) → ¬P(f(c)))"
    tree = client.post("/api/formula/analyze", json={"language": language, "formula": formula})
    kinds: set[str] = set()

    def walk(node: dict[str, Any]) -> None:
        kinds.add(node["kind"])
        for child in node["children"]:
            walk(child)

    walk(tree.json()["syntax_tree"])
    assert kinds == {
        "var", "const", "func", "eq", "pred", "not", "and", "or", "implies", "forall", "exists"
    }  # fmt: skip
