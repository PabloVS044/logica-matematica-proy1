"""Veredicto para leer en voz alta.

El resumen escrito usa la notación del curso (ℐ ⊭_{l[x↦a]} φ), que un sintetizador de voz
no sabe leer. Aquí se arma la misma información en español corriente:

    "Falso. La fórmula para todo equis … es falsa. Contraejemplo: equis vale a,
     i griega vale a, zeta vale b. Ahí, i griega es igual a zeta es falsa."
"""

import itertools

from evaluador.core.explain import ExplainNode, Justification
from evaluador.core.verbalize import spoken_name, verbalize


def _truth(value: bool) -> str:
    return "verdadera" if value else "falsa"


def spoken_verdict(root: ExplainNode) -> str:
    parts = [
        "Verdadero." if root.value else "Falso.",
        f"La fórmula {verbalize(root.formula, spell=True)} es {_truth(root.value)}",
    ]
    if root.env:
        values = ", ".join(f"{spoken_name(var)} igual a {value}" for var, value in root.env)
        parts[-1] += f", con {values}"
    parts[-1] += "."

    path = [root]
    while len(path[-1].decisive_children) == 1:
        path.append(path[-1].decisive_children[0])

    choices = [
        (parent.justification, child.binding)
        for parent, child in itertools.pairwise(path)
        if parent.justification in (Justification.WITNESS, Justification.COUNTEREXAMPLE)
        and child.binding is not None
    ]
    if choices:
        kinds = {kind for kind, _ in choices}
        if kinds == {Justification.WITNESS}:
            title = "Testigo"
        elif kinds == {Justification.COUNTEREXAMPLE}:
            title = "Contraejemplo"
        else:
            title = "Elecciones decisivas"
        values = ", ".join(f"{spoken_name(var)} vale {value}" for _, (var, value) in choices)
        parts.append(f"{title}: {values}.")

    last = path[-1]
    if last.justification is Justification.FULL_CHECK:
        parts.append("Se comprobó con cada elemento del dominio.")
    elif last is not root:
        parts.append(f"Ahí, {verbalize(last.formula, spell=True)} es {_truth(last.value)}.")
    return " ".join(parts)
