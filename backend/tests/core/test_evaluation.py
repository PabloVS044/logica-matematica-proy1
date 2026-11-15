from evaluador.core.evaluation import evaluate, validate
from evaluador.core.interpretation import FunctionRow, RawInterpretation
from evaluador.core.language import SymbolDecl

INTERP = RawInterpretation(
    domain=["a", "b"],
    constants={"c": "a"},
    functions={"f": [FunctionRow(("a",), "b"), FunctionRow(("b",), "a")]},
    predicates={"P": [("a",)]},
)


def run(formula: str, environment: dict[str, str] | None = None, **kwargs: object):  # type: ignore[no-untyped-def]
    params: dict[str, object] = {
        "constants": ["c"],
        "functions": [SymbolDecl("f", 1)],
        "predicates": [SymbolDecl("P", 1)],
        "interpretation": INTERP,
        "formula": formula,
        "environment": environment or {},
    }
    params.update(kwargs)
    return evaluate(**params)  # type: ignore[arg-type]


def test_closed_formula() -> None:
    result = run("∀x (P(x) ∨ P(f(x)))")
    assert result.ok
    assert result.value is True
    assert result.explanation is not None
    assert result.free_vars == ()


def test_open_formula_requires_environment() -> None:
    result = run("P(f(x))")
    assert not result.ok
    assert result.value is None
    assert [d.code for d in result.diagnostics] == ["E-ENV-001"]
    assert result.free_vars == ("x",)


def test_open_formula_with_environment() -> None:
    result = run("P(f(x))", {"x": "b"})
    assert result.value is True


def test_syntax_error_gets_no_value() -> None:
    result = run("P(x")
    assert result.value is None
    assert result.explanation is None
    assert [d.code for d in result.diagnostics] == ["E-SYN-002"]


def test_formula_and_interpretation_errors_reported_together() -> None:
    bad = RawInterpretation(["a", "b"], {}, {"f": []}, {"P": []})
    result = run("Q(c)", interpretation=bad)
    assert result.value is None
    codes = [d.code for d in result.diagnostics]
    assert codes[0] == "E-SYM-001"
    assert {"E-CON-001", "E-FUN-001", "E-REL-001"} <= set(codes)


def test_language_errors_stop_everything() -> None:
    result = run("P(c)", constants=["x"])
    assert result.value is None
    assert [d.code for d in result.diagnostics] == ["E-LNG-001"]


def test_warnings_do_not_block() -> None:
    result = run("∀y P(c)", {"z": "a"})
    assert result.ok
    assert result.value is True
    assert [d.code for d in result.diagnostics] == ["W-QNT-001", "W-ENV-001"]


def test_validate_without_evaluating() -> None:
    params: dict[str, object] = {
        "constants": ["c"],
        "functions": [SymbolDecl("f", 1)],
        "predicates": [SymbolDecl("P", 1)],
        "interpretation": INTERP,
        "environment": {"x": "b"},
    }
    valid = validate(formula="P(f(x))", **params).valid  # type: ignore[arg-type]
    assert valid is not None
    assert valid.environment("x") == "b"
    assert validate(formula="P(f(x)", **params).valid is None  # type: ignore[arg-type]
