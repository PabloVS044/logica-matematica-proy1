from fastapi.testclient import TestClient


def test_list_examples(client: TestClient) -> None:
    examples = client.get("/api/examples").json()
    assert [e["id"] for e in examples] == ["01-numeros", "02-letras", "03-entornos", "04-modulo-3"]
    assert all(e["title"] and e["description"] for e in examples)


def test_every_example_evaluates_without_errors(client: TestClient) -> None:
    for example in client.get("/api/examples").json():
        data = client.post("/api/evaluate", json=example["project"]).json()
        assert data["ok"], (example["id"], data["diagnostics"])
        assert data["diagnostics"] == []


def test_get_example(client: TestClient) -> None:
    example = client.get("/api/examples/02-letras").json()
    assert example["project"]["formula"].startswith("∀x ∀y ∀z")


def test_unknown_example(client: TestClient) -> None:
    response = client.get("/api/examples/no-existe")
    assert response.status_code == 404
    assert "no-existe" in response.json()["detail"]
