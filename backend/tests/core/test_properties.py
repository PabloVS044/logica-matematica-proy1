"""Propiedades lógicas verificadas con fórmulas e interpretaciones aleatorias."""

from hypothesis import given, settings
from hypothesis import strategies as st

from evaluador.core.environment import Environment
from evaluador.core.explain import ExplainNode, Justification, Rule, explain
from evaluador.core.freevars import free_vars
from evaluador.core.interpretation import Interpretation
from evaluador.core.semantics import satisfies
from evaluador.core.syntax_tree import And, Exists, ForAll, Formula, Implies, Not, Or

from .strategies import VARIABLES, formulas, models

Model = tuple[Interpretation, Environment]


@given(formulas, models())
def test_quantifier_duality(phi: Formula, model: Model) -> None:
    interp, env = model
    for x in VARIABLES:
        assert satisfies(ForAll(x, phi), interp, env) == satisfies(
            Not(Exists(x, Not(phi))), interp, env
        )
        assert satisfies(Exists(x, phi), interp, env) == satisfies(
            Not(ForAll(x, Not(phi))), interp, env
        )


@given(formulas, formulas, models())
def test_propositional_equivalences(phi: Formula, psi: Formula, model: Model) -> None:
    interp, env = model

    def v(f: Formula) -> bool:
        return satisfies(f, interp, env)

    assert v(Not(And(phi, psi))) == v(Or(Not(phi), Not(psi)))  # De Morgan
    assert v(Not(Or(phi, psi))) == v(And(Not(phi), Not(psi)))
    assert v(Implies(phi, psi)) == v(Or(Not(phi), psi))
    assert v(Not(Not(phi))) == v(phi)


@given(formulas, models(), st.data())
def test_coincidence_lemma(phi: Formula, model: Model, data: st.DataObject) -> None:
    # Si dos entornos coinciden en FV(φ), φ tiene el mismo valor en ambos.
    interp, env = model
    other = {
        var: env(var) if var in free_vars(phi) else data.draw(st.sampled_from(interp.domain))
        for var in VARIABLES
    }
    assert satisfies(phi, interp, env) == satisfies(phi, interp, Environment(other))


@settings(max_examples=200)
@given(formulas, models())
def test_explanation_agrees_with_semantics(phi: Formula, model: Model) -> None:
    interp, env = model
    root = explain(phi, interp, env).root
    assert root.value == satisfies(phi, interp, env)
    _check_node(root, interp)


def _check_node(node: ExplainNode, interp: Interpretation) -> None:
    """Cada nodo es coherente con sus hijos según la cláusula que aplica."""
    values = [c.value for c in node.children]
    decisive = [c for c in node.children if c.decisive]
    match node.rule:
        case Rule.ATOM_PRED | Rule.ATOM_EQ:
            assert node.children == ()
        case Rule.NOT:
            assert node.value == (not values[0])
        case Rule.AND:
            assert node.value == all(values)
            assert all(c.value == node.value for c in decisive)
        case Rule.OR:
            assert node.value == any(values)
            assert all(c.value == node.value for c in decisive)
        case Rule.IMPLIES:
            assert node.value == ((not values[0]) or values[1])
        case Rule.FORALL | Rule.EXISTS:
            assert len(node.children) == len(interp.domain)
            if node.rule is Rule.FORALL:
                assert node.value == all(values)
            else:
                assert node.value == any(values)
            if node.justification is Justification.FULL_CHECK:
                assert all(c.decisive for c in node.children)
                assert all(c.value == node.value for c in node.children)
            else:
                (choice,) = decisive
                expected = Justification.WITNESS if node.value else Justification.COUNTEREXAMPLE
                assert node.justification is expected
                assert choice.value == node.value
    if node.children:
        assert decisive, "todo nodo con hijos debe tener al menos un hijo decisivo"
    for child in node.children:
        _check_node(child, interp)
