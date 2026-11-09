from evaluador.core.analysis import analyze_formula
from evaluador.core.language import Signature


def test_valid_formula(exercise4_signature: Signature) -> None:
    analysis = analyze_formula("B(x,y) -> exists z S(z,y)", exercise4_signature)
    assert analysis.ok
    assert analysis.parenthesized == "B(x, y) → ∃z S(z, y)"
    assert analysis.free_vars == ["x", "y"]
    assert len(analysis.occurrences) == 4


def test_syntax_error_stops_analysis(exercise4_signature: Signature) -> None:
    analysis = analyze_formula("B(x,", exercise4_signature)
    assert not analysis.ok
    assert analysis.formula is None
    assert analysis.parenthesized is None
    assert [d.code for d in analysis.diagnostics] == ["E-SYN-004"]


def test_symbol_error_keeps_tree_but_not_ok(exercise4_signature: Signature) -> None:
    analysis = analyze_formula("B(x)", exercise4_signature)
    assert analysis.formula is not None
    assert not analysis.ok


def test_warning_does_not_block(exercise4_signature: Signature) -> None:
    analysis = analyze_formula("∀w S(m, m)", exercise4_signature)
    assert analysis.ok
    assert [d.code for d in analysis.diagnostics] == ["W-QNT-001"]
