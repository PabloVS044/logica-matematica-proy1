"""Generadores de hypothesis para términos y fórmulas aleatorias."""

import itertools

from hypothesis import strategies as st

from evaluador.core.environment import Environment
from evaluador.core.interpretation import Interpretation
from evaluador.core.syntax_tree import (
    And,
    Const,
    Eq,
    Exists,
    ForAll,
    Formula,
    Func,
    Implies,
    Not,
    Or,
    Pred,
    Term,
    Var,
)

VARIABLES = ["x", "y", "z", "x1"]
CONSTANTS = ["a", "b"]
FUNCTIONS = {"f": 1, "g": 2}
PREDICATES = {"P": 1, "R": 2}

terms: st.SearchStrategy[Term] = st.recursive(
    st.one_of(st.sampled_from(VARIABLES).map(Var), st.sampled_from(CONSTANTS).map(Const)),
    lambda inner: st.sampled_from(sorted(FUNCTIONS)).flatmap(
        lambda name: st.tuples(*[inner] * FUNCTIONS[name]).map(lambda args: Func(name, args))
    ),
    max_leaves=4,
)

atoms: st.SearchStrategy[Formula] = st.one_of(
    st.builds(Eq, terms, terms),
    st.sampled_from(sorted(PREDICATES)).flatmap(
        lambda name: st.tuples(*[terms] * PREDICATES[name]).map(lambda args: Pred(name, args))
    ),
)

formulas: st.SearchStrategy[Formula] = st.recursive(
    atoms,
    lambda inner: st.one_of(
        st.builds(Not, inner),
        st.builds(And, inner, inner),
        st.builds(Or, inner, inner),
        st.builds(Implies, inner, inner),
        st.builds(ForAll, st.sampled_from(VARIABLES), inner),
        st.builds(Exists, st.sampled_from(VARIABLES), inner),
    ),
    max_leaves=8,
)


# ------------------------------------------------------------------ interpretaciones

ELEMENTS = ["0", "1", "2"]


@st.composite
def interpretations(draw: st.DrawFn) -> Interpretation:
    """Interpretación válida para la signatura de este módulo, con |𝒟| entre 1 y 3."""
    size = draw(st.integers(min_value=1, max_value=len(ELEMENTS)))
    domain = tuple(ELEMENTS[:size])
    elements = st.sampled_from(domain)
    constants = {name: draw(elements) for name in CONSTANTS}
    functions = {
        name: {row: draw(elements) for row in itertools.product(domain, repeat=arity)}
        for name, arity in FUNCTIONS.items()
    }
    predicates = {}
    for name, arity in PREDICATES.items():
        rows = list(itertools.product(domain, repeat=arity))
        chosen = draw(st.sets(st.sampled_from(rows), min_size=1))
        predicates[name] = frozenset(chosen)
    return Interpretation(domain, constants, functions, predicates)


@st.composite
def models(draw: st.DrawFn) -> tuple[Interpretation, Environment]:
    """Interpretación más un entorno que asigna todas las variables de VARIABLES."""
    interp = draw(interpretations())
    values = {var: draw(st.sampled_from(interp.domain)) for var in VARIABLES}
    return interp, Environment(values)
