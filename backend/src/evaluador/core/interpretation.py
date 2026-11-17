"""Interpretaciones finitas ℐ = (𝒟, 𝒞, ℱ, 𝒫) y su validación (slides 10).

- 𝒟: dominio finito y no vacío.
- cᴵ ∈ 𝒟 para cada constante c.
- fᴵ: 𝒟ⁿ → 𝒟 total para cada símbolo funcional n-ario (un valor por cada tupla).
- Pᴵ ⊆ 𝒟ⁿ no vacía para cada predicado n-ario.
"""

import itertools
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from evaluador.core.errors import Diagnostic, Location, Severity
from evaluador.core.language import Signature

# El dominio puede tener cualquier tamaño finito; a partir de aquí solo se avisa que la
# evaluación (|𝒟|ᵏ casos con k cuantificadores anidados) puede tardar.
LARGE_DOMAIN_SIZE = 50
MAX_TABLE_ROWS = 10_000
_MAX_REPORTED_MISSING = 10
ELEMENT_PATTERN = re.compile(r"[A-Za-z0-9_]+")

type Element = str
type Row = tuple[Element, ...]


@dataclass(frozen=True, slots=True)
class FunctionRow:
    """Una fila de la tabla de una función: fᴵ(args) = value."""

    args: Row
    value: Element


@dataclass(frozen=True, slots=True)
class RawInterpretation:
    """Interpretación tal como la ingresa el usuario (aún sin validar)."""

    domain: Sequence[str]
    constants: Mapping[str, str]
    functions: Mapping[str, Sequence[FunctionRow]]
    predicates: Mapping[str, Sequence[Row]]


@dataclass(frozen=True, slots=True)
class Interpretation:
    """Interpretación validada. El orden de `domain` es el que ingresó el usuario."""

    domain: tuple[Element, ...]
    constants: dict[str, Element]
    functions: dict[str, dict[Row, Element]]
    predicates: dict[str, frozenset[Row]]


@dataclass(frozen=True, slots=True)
class InterpretationResult:
    interpretation: Interpretation | None
    diagnostics: list[Diagnostic]


def build_interpretation(raw: RawInterpretation, signature: Signature) -> InterpretationResult:
    """Valida `raw` contra la signatura. Devuelve None si hay algún error."""
    diagnostics: list[Diagnostic] = []
    domain = _validate_domain(raw.domain, diagnostics)
    if domain is None:
        return InterpretationResult(None, diagnostics)

    members = frozenset(domain)
    constants = _validate_constants(raw.constants, signature, members, diagnostics)
    functions = _validate_functions(raw.functions, signature, domain, diagnostics)
    predicates = _validate_predicates(raw.predicates, signature, members, diagnostics)

    if any(d.is_error for d in diagnostics):
        return InterpretationResult(None, diagnostics)
    return InterpretationResult(
        Interpretation(domain, constants, functions, predicates), diagnostics
    )


def _error(code: str, message: str, kind: str, *path: str | int) -> Diagnostic:
    return Diagnostic(code, message, Location(kind, path=tuple(path)))


def _warning(code: str, message: str, kind: str, *path: str | int) -> Diagnostic:
    return Diagnostic(code, message, Location(kind, path=tuple(path)), Severity.WARNING)


def _format_row(row: Row) -> str:
    return f"({', '.join(row)})"


# ------------------------------------------------------------------ dominio


def _validate_domain(elements: Sequence[str], out: list[Diagnostic]) -> tuple[Element, ...] | None:
    if not elements:
        out.append(_error("E-DOM-001", "El dominio 𝒟 no puede ser vacío.", "domain"))
        return None
    if len(elements) > LARGE_DOMAIN_SIZE:
        out.append(
            _warning(
                "W-DOM-001",
                f"El dominio tiene {len(elements)} elementos: con varios cuantificadores "
                "anidados la evaluación puede tardar.",
                "domain",
            )
        )

    ok = True
    seen: set[str] = set()
    for i, element in enumerate(elements):
        if ELEMENT_PATTERN.fullmatch(element) is None:
            out.append(
                _error(
                    "E-DOM-002",
                    f"'{element}' no es un nombre de elemento válido: use letras, dígitos o '_'.",
                    "domain",
                    i,
                )
            )
            ok = False
        elif element in seen:
            out.append(_error("E-DOM-002", f"El elemento '{element}' está repetido.", "domain", i))
            ok = False
        seen.add(element)
    return tuple(elements) if ok else None


# ------------------------------------------------------------------ constantes


def _validate_constants(
    raw: Mapping[str, str],
    signature: Signature,
    members: frozenset[Element],
    out: list[Diagnostic],
) -> dict[str, Element]:
    result: dict[str, Element] = {}
    for name in sorted(signature.constants):
        value = raw.get(name)
        if value is None:
            out.append(
                _error("E-CON-001", f"Falta el valor de la constante {name}ᴵ.", "constant", name)
            )
        elif value not in members:
            out.append(
                _error(
                    "E-CON-001",
                    f"El valor de {name}ᴵ es '{value}', que no pertenece a 𝒟.",
                    "constant",
                    name,
                )
            )
        else:
            result[name] = value
    for name in raw:
        if name not in signature.constants:
            out.append(
                _warning(
                    "W-INT-001",
                    f"'{name}' no es una constante del lenguaje; su valor se ignora.",
                    "constant",
                    name,
                )
            )
    return result


# ------------------------------------------------------------------ funciones


def _validate_functions(
    raw: Mapping[str, Sequence[FunctionRow]],
    signature: Signature,
    domain: tuple[Element, ...],
    out: list[Diagnostic],
) -> dict[str, dict[Row, Element]]:
    members = frozenset(domain)
    result: dict[str, dict[Row, Element]] = {}
    for name, arity in sorted(signature.functions.items()):
        size = len(domain) ** arity
        if size > MAX_TABLE_ROWS:
            out.append(
                _error(
                    "E-FUN-004",
                    f"La tabla de {name}ᴵ tendría |𝒟|^{arity} = {size} filas; "
                    f"el máximo es {MAX_TABLE_ROWS}.",
                    "function",
                    name,
                )
            )
            continue
        table = _validate_function_table(name, arity, raw.get(name, ()), members, out)
        missing = [row for row in itertools.product(domain, repeat=arity) if row not in table]
        for row in missing[:_MAX_REPORTED_MISSING]:
            out.append(
                _error(
                    "E-FUN-001",
                    f"Falta el valor de {name}ᴵ{_format_row(row)}: la función debe estar "
                    "definida para todas las tuplas de 𝒟ⁿ.",
                    "function",
                    name,
                    *row,
                )
            )
        if len(missing) > _MAX_REPORTED_MISSING:
            out.append(
                _error(
                    "E-FUN-001",
                    f"A {name}ᴵ le faltan {len(missing)} valores en total.",
                    "function",
                    name,
                )
            )
        result[name] = table
    for name in raw:
        if name not in signature.functions:
            out.append(
                _warning(
                    "W-INT-001",
                    f"'{name}' no es un símbolo funcional del lenguaje; su tabla se ignora.",
                    "function",
                    name,
                )
            )
    return result


def _validate_function_table(
    name: str,
    arity: int,
    rows: Sequence[FunctionRow],
    members: frozenset[Element],
    out: list[Diagnostic],
) -> dict[Row, Element]:
    table: dict[Row, Element] = {}
    for row in rows:
        args = tuple(row.args)
        if len(args) != arity:
            out.append(
                _error(
                    "E-FUN-003",
                    f"La tupla {_format_row(args)} de {name}ᴵ tiene {len(args)} elementos, "
                    f"pero la aridad es {arity}.",
                    "function",
                    name,
                    *args,
                )
            )
            continue
        outside = [a for a in args if a not in members]
        if outside:
            out.append(
                _error(
                    "E-FUN-003",
                    f"La tupla {_format_row(args)} de {name}ᴵ usa '{outside[0]}', "
                    "que no pertenece a 𝒟.",
                    "function",
                    name,
                    *args,
                )
            )
            continue
        if row.value not in members:
            out.append(
                _error(
                    "E-FUN-002",
                    f"{name}ᴵ{_format_row(args)} = '{row.value}', que no pertenece a 𝒟.",
                    "function",
                    name,
                    *args,
                )
            )
            continue
        if args in table and table[args] != row.value:
            out.append(
                _error(
                    "E-FUN-005",
                    f"{name}ᴵ{_format_row(args)} tiene dos valores distintos "
                    f"('{table[args]}' y '{row.value}'); una función asigna un único valor.",
                    "function",
                    name,
                    *args,
                )
            )
            continue
        table[args] = row.value
    return table


# ------------------------------------------------------------------ relaciones


def _validate_predicates(
    raw: Mapping[str, Sequence[Row]],
    signature: Signature,
    members: frozenset[Element],
    out: list[Diagnostic],
) -> dict[str, frozenset[Row]]:
    result: dict[str, frozenset[Row]] = {}
    for name, arity in sorted(signature.predicates.items()):
        relation: set[Row] = set()
        for row in raw.get(name, ()):
            tup = tuple(row)
            if len(tup) != arity:
                out.append(
                    _error(
                        "E-REL-002",
                        f"La tupla {_format_row(tup)} de {name}ᴵ tiene {len(tup)} elementos, "
                        f"pero la aridad es {arity}.",
                        "predicate",
                        name,
                        *tup,
                    )
                )
                continue
            outside = [a for a in tup if a not in members]
            if outside:
                out.append(
                    _error(
                        "E-REL-003",
                        f"La tupla {_format_row(tup)} de {name}ᴵ usa '{outside[0]}', "
                        "que no pertenece a 𝒟.",
                        "predicate",
                        name,
                        *tup,
                    )
                )
                continue
            if tup in relation:
                out.append(
                    _warning(
                        "W-REL-001",
                        f"La tupla {_format_row(tup)} está repetida en {name}ᴵ; se cuenta una vez.",
                        "predicate",
                        name,
                        *tup,
                    )
                )
            relation.add(tup)
        # Si hubo tuplas pero todas eran inválidas, ya se reportaron esos errores.
        if not raw.get(name):
            out.append(
                _error(
                    "E-REL-001",
                    f"La relación {name}ᴵ está vacía; debe contener al menos una tupla.",
                    "predicate",
                    name,
                )
            )
        result[name] = frozenset(relation)
    for name in raw:
        if name not in signature.predicates:
            out.append(
                _warning(
                    "W-INT-001",
                    f"'{name}' no es un predicado del lenguaje; su relación se ignora.",
                    "predicate",
                    name,
                )
            )
    return result
