from typing import Any

from fastapi.testclient import TestClient


def test_translate(client: TestClient, project: dict[str, Any]) -> None:
    request = {
        "language": project["language"],
        "transcript": "para todo x, existe y tal que Q de x y y",
    }
    data = client.post("/api/speech/translate", json=request).json()
    assert data["ok"] is True
    assert data["formula"] == "∀x ∃y Q(x, y)"
    assert data["spoken"] == "para todo equis existe i griega cu de equis coma i griega"
    roles = [(m["text"], m["role"], m["meaning"]) for m in data["marks"]]
    assert ("y", "palabra clave", ",") not in roles
    assert roles[-1] == ("y", "variable", "y")


def test_translate_error_has_position(client: TestClient, project: dict[str, Any]) -> None:
    transcript = "R de gato"
    request = {"language": project["language"], "transcript": transcript}
    data = client.post("/api/speech/translate", json=request).json()
    assert data["ok"] is False
    assert data["formula"] is None
    (diagnostic,) = data["diagnostics"]
    assert diagnostic["code"] == "E-SPK-001"
    location = diagnostic["location"]
    assert transcript[location["start"] : location["end"]] == "gato"


def test_translate_with_invalid_language(client: TestClient) -> None:
    request = {"language": {"constants": ["x"]}, "transcript": "x es igual a x"}
    data = client.post("/api/speech/translate", json=request).json()
    assert [d["code"] for d in data["diagnostics"]] == ["E-LNG-001"]


def test_command(client: TestClient) -> None:
    assert client.post("/api/speech/command", json={"utterance": "Borra eso"}).json() == {
        "command": "borrar"
    }
    assert client.post("/api/speech/command", json={"utterance": "R de x"}).json() == {
        "command": None
    }


def test_evaluation_is_spoken(client: TestClient, project: dict[str, Any]) -> None:
    data = client.post("/api/evaluate", json=project).json()
    assert data["spoken_summary"].startswith("Verdadero. La fórmula existe i griega")
    assert data["explanation"]["spoken"] == "existe i griega cu de i coma i griega"


def test_analysis_is_spoken(client: TestClient, project: dict[str, Any]) -> None:
    request = {"language": project["language"], "formula": "¬R(i)"}
    assert client.post("/api/formula/analyze", json=request).json()["spoken"] == "no erre de i"
