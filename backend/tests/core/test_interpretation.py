import itertools

import pytest

from evaluador.core.interpretation import (
    LARGE_DOMAIN_SIZE,
    FunctionRow,
    RawInterpretation,
    build_interpretation,
)
from evaluador.core.language import Signature

from .conftest import make_signature


@pytest.fixture
def signature() -> Signature:
    return make_signature(["c"], {"f": 1, "g": 2}, {"P": 1, "R": 2})


def full_function(domain: list[str], arity: int, value: str) -> list[FunctionRow]:
    return [FunctionRow(row, value) for row in itertools.product(domain, repeat=arity)]


def valid_raw(**overrides: object) -> RawInterpretation:
    domain = ["a", "b"]
    data: dict[str, object] = {
        "domain": domain,
        "constants": {"c": "a"},
        "functions": {"f": full_function(domain, 1, "b"), "g": full_function(domain, 2, "a")},
        "predicates": {"P": [("a",)], "R": [("a", "b"), ("b", "b")]},
    }
    data.update(overrides)
    return RawInterpretation(**data)  # type: ignore[arg-type]


def codes(raw: RawInterpretation, signature: Signature) -> list[str]:
    return [d.code for d in build_interpretation(raw, signature).diagnostics]


def test_valid_interpretation(signature: Signature) -> None:
    result = build_interpretation(valid_raw(), signature)
    assert result.diagnostics == []
    interp = result.interpretation
    assert interp is not None
    assert interp.domain == ("a", "b")
    assert interp.constants == {"c": "a"}
    assert interp.functions["g"][("b", "a")] == "a"
    assert interp.predicates["R"] == frozenset({("a", "b"), ("b", "b")})


def test_domain_order_is_preserved(signature: Signature) -> None:
    raw = valid_raw(domain=["b", "a"])
    interp = build_interpretation(raw, signature).interpretation
    assert interp is not None
    assert interp.domain == ("b", "a")


@pytest.mark.parametrize(
    ("domain", "code"),
    [
        ([], "E-DOM-001"),
        (["a", "a"], "E-DOM-002"),
        (["a", "b c"], "E-DOM-002"),
        (["a", ""], "E-DOM-002"),
    ],
)
def test_domain_errors(domain: list[str], code: str, signature: Signature) -> None:
    result = build_interpretation(valid_raw(domain=domain), signature)
    assert result.interpretation is None
    assert code in [d.code for d in result.diagnostics]


def test_large_domain_is_accepted_with_a_warning(signature: Signature) -> None:
    # Más que el umbral de aviso: el dominio no tiene tamaño máximo.
    domain = [str(i) for i in range(LARGE_DOMAIN_SIZE * 2)]
    raw = valid_raw(
        domain=domain,
        constants={"c": "0"},
        functions={"f": full_function(domain, 1, "1"), "g": full_function(domain, 2, "0")},
        predicates={"P": [("0",)], "R": [("0", "1")]},
    )
    result = build_interpretation(raw, signature)
    assert result.interpretation is not None
    assert len(result.interpretation.domain) == LARGE_DOMAIN_SIZE * 2
    assert [d.code for d in result.diagnostics] == ["W-DOM-001"]


def test_numeric_domain_elements_are_valid() -> None:
    signature = make_signature(predicates={"P": 1})
    raw = RawInterpretation(["1", "2", "3"], {}, {}, {"P": [("1",)]})
    assert build_interpretation(raw, signature).interpretation is not None


@pytest.mark.parametrize("constants", [{}, {"c": "z"}])
def test_constant_errors(constants: dict[str, str], signature: Signature) -> None:
    assert codes(valid_raw(constants=constants), signature) == ["E-CON-001"]


def test_function_must_be_total(signature: Signature) -> None:
    functions = {"f": [FunctionRow(("a",), "b")], "g": full_function(["a", "b"], 2, "a")}
    result = build_interpretation(valid_raw(functions=functions), signature)
    assert result.interpretation is None
    (diagnostic,) = result.diagnostics
    assert diagnostic.code == "E-FUN-001"
    assert diagnostic.location.path == ("f", "b")
    assert "fᴵ(b)" in diagnostic.message


def test_missing_function_reports_are_capped() -> None:
    signature = make_signature(functions={"h": 3})
    domain = [str(i) for i in range(5)]
    raw = RawInterpretation(domain, {}, {}, {})
    diagnostics = build_interpretation(raw, signature).diagnostics
    assert len(diagnostics) == 11
    assert "125" in diagnostics[-1].message


@pytest.mark.parametrize(
    ("row", "code"),
    [
        (FunctionRow(("a",), "z"), "E-FUN-002"),
        (FunctionRow(("z",), "a"), "E-FUN-003"),
        (FunctionRow(("a", "b"), "a"), "E-FUN-003"),
        (FunctionRow(("a",), "a"), "E-FUN-005"),  # f(a) ya vale b
    ],
)
def test_function_row_errors(row: FunctionRow, code: str, signature: Signature) -> None:
    functions = {
        "f": [*full_function(["a", "b"], 1, "b"), row],
        "g": full_function(["a", "b"], 2, "a"),
    }
    assert codes(valid_raw(functions=functions), signature) == [code]


def test_function_table_too_large() -> None:
    signature = make_signature(functions={"h": 4})
    raw = RawInterpretation([str(i) for i in range(11)], {}, {}, {})
    assert [d.code for d in build_interpretation(raw, signature).diagnostics] == ["E-FUN-004"]


@pytest.mark.parametrize(
    ("relation", "expected"),
    [
        ([], ["E-REL-001"]),
        ([("a",)], ["E-REL-002"]),
        ([("a", "z")], ["E-REL-003"]),
        ([("a", "b"), ("a", "b")], ["W-REL-001"]),
    ],
)
def test_relation_errors(
    relation: list[tuple[str, ...]], expected: list[str], signature: Signature
) -> None:
    raw = valid_raw(predicates={"P": [("a",)], "R": relation})
    assert codes(raw, signature) == expected


def test_missing_relation_is_empty(signature: Signature) -> None:
    assert codes(valid_raw(predicates={"P": [("a",)]}), signature) == ["E-REL-001"]


def test_duplicate_tuple_is_only_a_warning(signature: Signature) -> None:
    raw = valid_raw(predicates={"P": [("a",), ("a",)], "R": [("a", "b")]})
    result = build_interpretation(raw, signature)
    assert result.interpretation is not None
    assert result.interpretation.predicates["P"] == frozenset({("a",)})


def test_unknown_symbols_are_warnings(signature: Signature) -> None:
    raw = valid_raw(
        constants={"c": "a", "k": "a"},
        functions={**valid_raw().functions, "h": []},
        predicates={**valid_raw().predicates, "S": [("a",)]},
    )
    result = build_interpretation(raw, signature)
    assert result.interpretation is not None
    assert [d.code for d in result.diagnostics] == ["W-INT-001"] * 3


def test_all_errors_are_reported_together(signature: Signature) -> None:
    raw = valid_raw(constants={}, predicates={"P": [], "R": [("a", "z")]})
    assert codes(raw, signature) == ["E-CON-001", "E-REL-001", "E-REL-003"]
