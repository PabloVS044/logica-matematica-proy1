from typing import Any

import pytest
from fastapi.testclient import TestClient

from evaluador.api.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def project() -> dict[str, Any]:
    """Slides 10: 𝒟 = {a, b, c}, iᴵ = a, Rᴵ = {b, c}, Qᴵ = {...}."""
    return {
        "language": {
            "constants": ["i"],
            "functions": [],
            "predicates": [{"name": "R", "arity": 1}, {"name": "Q", "arity": 2}],
        },
        "interpretation": {
            "domain": ["a", "b", "c"],
            "constants": {"i": "a"},
            "functions": {},
            "predicates": {
                "R": [["b"], ["c"]],
                "Q": [["a", "a"], ["a", "b"], ["a", "c"], ["b", "c"], ["c", "c"]],
            },
        },
        "formula": "∃y Q(i, y)",
        "environment": {},
    }
