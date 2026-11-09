"""Entornos l: V → 𝒟 (slides 11).

`l[x ↦ a]` es el entorno idéntico a l excepto que x vale a. Los entornos son
inmutables: `update` crea uno nuevo y deja el original sin cambios.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from evaluador.core.errors import Diagnostic, Location, Severity
from evaluador.core.interpretation import Element


@dataclass(frozen=True, slots=True)
class Environment:
    values: Mapping[str, Element] = field(default_factory=dict)
    label: str = "l"  # nombre en notación del curso: l, l[x↦a], l[x↦a][y↦b], …

    def __call__(self, var: str) -> Element:
        return self.values[var]

    def update(self, var: str, element: Element) -> "Environment":
        """l[x ↦ a]"""
        return Environment({**self.values, var: element}, f"{self.label}[{var}↦{element}]")

    def restricted_to(self, names: Sequence[str]) -> tuple[tuple[str, Element], ...]:
        """Pares (variable, valor) para las variables dadas que estén definidas."""
        return tuple((name, self.values[name]) for name in names if name in self.values)


@dataclass(frozen=True, slots=True)
class EnvironmentResult:
    environment: Environment | None
    diagnostics: list[Diagnostic]


def build_environment(
    raw: Mapping[str, str], free_vars: Sequence[str], domain: Sequence[Element]
) -> EnvironmentResult:
    """Valida que el entorno asigne un elemento de 𝒟 a cada variable libre."""
    diagnostics: list[Diagnostic] = []
    members = frozenset(domain)
    values: dict[str, Element] = {}
    for var in free_vars:
        value = raw.get(var)
        location = Location("environment", path=(var,))
        if value is None or value == "":
            diagnostics.append(
                Diagnostic(
                    "E-ENV-001",
                    f"La variable libre {var} no tiene valor: el entorno debe fijar l({var}) ∈ 𝒟.",
                    location,
                )
            )
        elif value not in members:
            diagnostics.append(
                Diagnostic(
                    "E-ENV-002",
                    f"l({var}) = '{value}', que no pertenece a 𝒟.",
                    location,
                )
            )
        else:
            values[var] = value
    for var in raw:
        if var not in free_vars:
            diagnostics.append(
                Diagnostic(
                    "W-ENV-001",
                    f"{var} no es variable libre de la fórmula; su valor se ignora.",
                    Location("environment", path=(var,)),
                    Severity.WARNING,
                )
            )
    if any(d.is_error for d in diagnostics):
        return EnvironmentResult(None, diagnostics)
    return EnvironmentResult(Environment(values), diagnostics)
