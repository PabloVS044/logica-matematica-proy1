import pytest

from evaluador.core.language import SymbolDecl, SymbolKind, build_signature


def test_valid_signature() -> None:
    result = build_signature(["m", "c1"], [SymbolDecl("f", 1)], [SymbolDecl("S", 2)])
    assert result.diagnostics == []
    signature = result.signature
    assert signature is not None
    assert signature.kind_of("m") is SymbolKind.CONSTANT
    assert signature.kind_of("f") is SymbolKind.FUNCTION
    assert signature.kind_of("S") is SymbolKind.PREDICATE
    assert signature.kind_of("Z") is None
    assert signature.predicates == {"S": 2}


def test_empty_language_is_valid() -> None:
    assert build_signature([], [], []).signature is not None


@pytest.mark.parametrize("name", ["x", "y2", "forall", "not", "1a", "_P", "P-1", ""])
def test_invalid_names(name: str) -> None:
    result = build_signature([name], [], [])
    assert result.signature is None
    assert [d.code for d in result.diagnostics] == ["E-LNG-001"]


def test_duplicate_names_across_categories() -> None:
    result = build_signature(["a"], [SymbolDecl("a", 1)], [SymbolDecl("P", 1), SymbolDecl("P", 2)])
    assert result.signature is None
    assert [d.code for d in result.diagnostics] == ["E-LNG-002", "E-LNG-002"]
    assert "constante" in result.diagnostics[0].message


@pytest.mark.parametrize("arity", [0, -1])
def test_invalid_arity(arity: int) -> None:
    result = build_signature([], [SymbolDecl("f", arity)], [SymbolDecl("P", arity)])
    assert [d.code for d in result.diagnostics] == ["E-LNG-003", "E-LNG-003"]


def test_error_location_identifies_declaration() -> None:
    result = build_signature([], [], [SymbolDecl("P", 1), SymbolDecl("x", 1)])
    (diagnostic,) = result.diagnostics
    assert diagnostic.location.kind == "language"
    assert diagnostic.location.path == ("predicado", 1)


def test_zero_arity_messages_explain_why() -> None:
    result = build_signature([], [SymbolDecl("c", 0)], [SymbolDecl("P", 0)])
    function, predicate = result.diagnostics
    assert "declara 'c' como constante" in function.message
    assert "sería siempre verdadero" in predicate.message
