import pytest

from evaluador.core.language import Signature, SymbolDecl, build_signature


def make_signature(
    constants: list[str] | None = None,
    functions: dict[str, int] | None = None,
    predicates: dict[str, int] | None = None,
) -> Signature:
    result = build_signature(
        constants or [],
        [SymbolDecl(n, a) for n, a in (functions or {}).items()],
        [SymbolDecl(n, a) for n, a in (predicates or {}).items()],
    )
    assert result.signature is not None, result.diagnostics
    return result.signature


@pytest.fixture
def exercise4_signature() -> Signature:
    """Slides 07, ejercicio 4: 𝒞 = {m}, ℱ = {f/1}, ℛ = {S/2, B/2}."""
    return make_signature(["m"], {"f": 1}, {"S": 2, "B": 2})
