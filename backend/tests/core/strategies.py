"""Generadores de hypothesis para términos y fórmulas aleatorias."""

from hypothesis import strategies as st

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
