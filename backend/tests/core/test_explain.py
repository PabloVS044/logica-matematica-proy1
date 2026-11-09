import pytest

from evaluador.core.environment import Environment
from evaluador.core.explain import ExplainNode, Justification, Rule, explain
from evaluador.core.parser import parse

from .test_semantics import MOD3


def root(text: str, **env: str) -> ExplainNode:
    return explain(parse(text), MOD3, Environment(env)).root


def test_atomic_predicate_reason_and_computations() -> None:
    node = root("L(zero, s(x))", x="1")
    assert node.value
    assert node.rule is Rule.ATOM_PRED
    assert node.computations == (
        "⟦zero⟧_{l} = zeroᴵ = 0",
        "⟦x⟧_{l} = l(x) = 1",
        "⟦s(x)⟧_{l} = sᴵ(1) = 2",
    )
    assert node.reason == "(0, 2) ∈ Lᴵ, por lo tanto ℐ ⊨_{l} L(zero, s(x))."
    assert node.env == (("x", "1"),)


def test_atomic_equality_reason() -> None:
    node = root("s(zero) = zero")
    assert not node.value
    assert node.rule is Rule.ATOM_EQ
    assert node.reason.startswith("1 ≠ 0")


def test_unary_predicate_has_no_tuple_parentheses() -> None:
    assert root("Even(zero)").reason.startswith("0 ∈ Evenᴵ")


@pytest.mark.parametrize(
    ("text", "decisive"),
    [
        ("Even(zero) ∧ Even(s(zero))", (False, True)),
        ("Even(s(zero)) ∧ Even(zero)", (True, False)),
        ("Even(zero) ∧ Even(zero)", (True, True)),
        ("Even(zero) ∨ Even(s(zero))", (True, False)),
        ("Even(s(zero)) ∨ Even(zero)", (False, True)),
        ("Even(s(zero)) ∨ Even(s(zero))", (True, True)),
        ("Even(s(zero)) → Even(s(zero))", (True, False)),  # antecedente falso
        ("Even(zero) → Even(zero)", (False, True)),  # consecuente verdadero
        ("Even(zero) → Even(s(zero))", (True, True)),  # V → F
    ],
)
def test_binary_decisive_children(text: str, decisive: tuple[bool, bool]) -> None:
    node = root(text)
    assert tuple(child.decisive for child in node.children) == decisive


def test_witness_is_first_in_domain_order() -> None:
    node = root("∃x Even(x)")
    assert node.justification is Justification.WITNESS
    assert [c.binding for c in node.children if c.decisive] == [("x", "0")]
    assert node.reason.startswith("Testigo: x ↦ 0.")


def test_counterexample() -> None:
    node = root("∀x Even(x)")
    assert node.justification is Justification.COUNTEREXAMPLE
    assert [c.binding for c in node.children if c.decisive] == [("x", "1")]
    assert node.children[1].env_label == "l[x↦1]"


def test_full_check_for_true_universal() -> None:
    node = root("∀x s(s(s(x))) = x")
    assert node.justification is Justification.FULL_CHECK
    assert len(node.children) == 3
    assert all(c.decisive and c.value for c in node.children)
    assert "(3 casos)" in node.reason
    assert "𝑎 ∈ 𝒟 = {0, 1, 2}" in node.reason


def test_full_check_for_false_existential() -> None:
    node = root("∃x L(x, x)")
    assert node.justification is Justification.FULL_CHECK
    assert all(c.decisive and not c.value for c in node.children)


def test_nested_environment_labels() -> None:
    node = root("∀x ∃y plus(x, y) = zero")
    inner = node.children[2].children[1]
    assert inner.env_label == "l[x↦2][y↦1]"
    assert inner.env == (("x", "2"), ("y", "1"))


def test_summary_lists_decisive_path() -> None:
    explanation = explain(parse("∀x ∀y (L(x, y) ∨ x = y)"), MOD3, Environment())
    assert explanation.summary.startswith(
        "Falso. ℐ ⊭_{l} ∀x ∀y (L(x, y) ∨ x = y); contraejemplo: x ↦ 1, y ↦ 0."
    )


def test_summary_without_quantifier_choices() -> None:
    explanation = explain(parse("∀x s(s(s(x))) = x"), MOD3, Environment())
    assert explanation.summary.startswith("Verdadero. Comprobación completa")


def test_node_budget_truncates_but_keeps_value() -> None:
    formula = parse("∀x ∀y ∀z (L(x, y) → L(x, z))")
    full = explain(formula, MOD3, Environment())
    small = explain(formula, MOD3, Environment(), node_budget=5)
    assert not full.truncated
    assert small.truncated
    assert small.root.value == full.root.value
    assert any(child.pruned for child in small.root.children)


def test_summary_with_witness_and_counterexample() -> None:
    explanation = explain(parse("∃x ¬∀y L(x, y)"), MOD3, Environment())
    assert "elecciones decisivas: x ↦ 0, y ↦ 0" in explanation.summary


@pytest.mark.parametrize(
    ("text", "rule"),
    [
        ("¬Even(zero)", Rule.NOT),
        ("Even(zero) ∧ Even(zero)", Rule.AND),
        ("Even(zero) ∨ Even(zero)", Rule.OR),
        ("Even(zero) → Even(zero)", Rule.IMPLIES),
        ("∀x Even(x)", Rule.FORALL),
        ("∃x Even(x)", Rule.EXISTS),
    ],
)
def test_pruned_nodes_keep_rule_and_value(text: str, rule: Rule) -> None:
    formula = parse(f"Even(zero) ∧ ({text})")
    explanation = explain(formula, MOD3, Environment(), node_budget=2)
    pruned = explanation.root.children[1]
    assert pruned.pruned
    assert pruned.rule is rule
    assert pruned.children == ()
    assert pruned.value == explain(parse(text), MOD3, Environment()).root.value
