"""Ejemplos y ejercicios de las presentaciones del curso, evaluados a través de la API.

Las fórmulas se escriben como en las diapositivas (por ejemplo ∃xQ(x), con la variable
pegada). Cuando una diapositiva no da interpretación, o su dominio es infinito (naturales,
cadenas), se usa una interpretación finita pequeña y el resultado esperado se calculó a mano.
"""

import itertools
from typing import Any

import pytest
from fastapi.testclient import TestClient

Project = dict[str, Any]


def project(
    domain: list[str],
    *,
    constants: dict[str, str] | None = None,
    functions: dict[str, dict[tuple[str, ...], str]] | None = None,
    predicates: dict[str, list[tuple[str, ...]]],
    arities: dict[str, int] | None = None,
) -> Project:
    """Proyecto a partir de las tablas; la aridad se deduce de las tuplas."""
    functions = functions or {}
    arities = arities or {}
    return {
        "language": {
            "constants": list(constants or {}),
            "functions": [
                {"name": name, "arity": len(next(iter(table)))} for name, table in functions.items()
            ],
            "predicates": [
                {"name": name, "arity": arities.get(name) or len(rows[0])}
                for name, rows in predicates.items()
            ],
        },
        "interpretation": {
            "domain": domain,
            "constants": constants or {},
            "functions": {
                name: [{"args": list(args), "value": value} for args, value in table.items()]
                for name, table in functions.items()
            },
            "predicates": {name: [list(row) for row in rows] for name, rows in predicates.items()},
        },
    }


def evaluate(
    client: TestClient, base: Project, formula: str, environment: dict[str, str] | None = None
) -> dict[str, Any]:
    body = {**base, "formula": formula, "environment": environment or {}}
    response = client.post("/api/evaluate", json=body)
    assert response.status_code == 200
    data: dict[str, Any] = response.json()
    return data


def decisive_bindings(node: dict[str, Any]) -> list[tuple[str, str]]:
    """Asignaciones de la ruta decisiva (testigos y contraejemplos)."""
    result = []
    while len(decisive := [c for c in node["children"] if c["decisive"]]) == 1:
        node = decisive[0]
        if node["binding"]:
            result.append((node["binding"]["var"], node["binding"]["value"]))
    return result


def check(
    data: dict[str, Any],
    value: bool,
    justification: str | None = None,
    path: list[tuple[str, str]] | None = None,
) -> None:
    assert data["ok"], data["diagnostics"]
    assert data["value"] is value
    root = data["explanation"]
    if justification is not None:
        assert root["justification"] == justification
    if path is not None:
        assert decisive_bindings(root) == path


# ------------------------------------------------------------------ 07 Lenguajes de primer orden

# Ejercicio 1: Sócrates. s: Sócrates; H: ser hombre; M: ser mortal.
SOCRATES = project(
    ["soc", "pla", "fido"],
    constants={"s": "soc"},
    predicates={"H": [("soc",), ("pla",)], "M": [("soc",), ("pla",), ("fido",)]},
)


@pytest.mark.parametrize(
    ("formula", "value", "justification", "path"),
    [
        ("¬M(s)", False, None, []),
        ("¬H(s)", False, None, []),
        ("¬M(s) ∧ ¬H(s)", False, None, []),
        ("¬∀x(H(x) → M(x))", False, None, []),
        ("∀x(H(x) → ¬M(x))", False, "contraejemplo", [("x", "soc")]),
        ("∃x(H(x) ∧ ¬M(x))", False, "comprobación completa", []),
        # El argumento: todos los hombres son mortales, Sócrates es hombre ⇒ es mortal.
        ("∀x(H(x) → M(x)) ∧ H(s) → M(s)", True, None, None),
    ],
)
def test_07_ejercicio_1_socrates(
    client: TestClient, formula: str, value: bool, justification: str | None, path: Any
) -> None:
    check(evaluate(client, SOCRATES, formula), value, justification, path)


# Ejercicio 2: P(x, y) "x es menor o igual a y" en los naturales; aquí 𝒟 = {0, 1, 2, 3}.
ORDER = ["0", "1", "2", "3"]
LEQ = [(a, b) for a in ORDER for b in ORDER if int(a) <= int(b)]
NATURALS = project(ORDER, constants={"c": "0"}, predicates={"P": LEQ})


@pytest.mark.parametrize(
    ("formula", "value"),
    [
        ("∀xP(c, x)", True),  # a. 0 es menor o igual que cualquier número
        # b. "No existe un último número": en un dominio finito sí existe (el 3).
        ("¬∃x∀yP(y, x)", False),
        ("∀x∃yP(x, y)", True),  # c. todo número tiene uno mayor o igual
        ("∀x∀y∀z(P(x, y) ∧ P(y, z) → P(x, z))", True),  # d. transitividad
    ],
)
def test_07_ejercicio_2_orden(client: TestClient, formula: str, value: bool) -> None:
    check(evaluate(client, NATURALS, formula), value)


def test_07_ejercicio_2_ultimo_numero_tiene_testigo(client: TestClient) -> None:
    data = evaluate(client, NATURALS, "∃x∀yP(y, x)")
    check(data, True, "testigo", [("x", "3")])


# Ejercicio 3: A admira, B asistió, P profesor, S estudiante, L clase magistral, m María.
SCHOOL = project(
    ["maria", "ana", "rojas", "logica"],
    constants={"m": "maria"},
    predicates={
        "A": [("maria", "rojas"), ("maria", "maria"), ("rojas", "maria")],
        "B": [("maria", "logica")],
        "P": [("rojas",)],
        "S": [("maria",), ("ana",)],
        "L": [("logica",)],
    },
)


@pytest.mark.parametrize(
    ("formula", "value"),
    [
        ("∀x(P(x) → A(m, x))", True),  # a. María admira a todos los profesores
        ("∃x(P(x) ∧ A(x, m))", True),  # b. algún profesor admira a María
        ("A(m, m)", True),  # c. María se admira a sí misma
        ("¬∃x(S(x) ∧ ∀y(L(y) → B(x, y)))", False),  # d. María asistió a todas
        ("¬∃y(L(y) ∧ ∀x(S(x) → B(x, y)))", True),  # e. Ana no asistió a lógica
        ("¬∃x∃y(S(x) ∧ L(y) ∧ B(x, y))", False),  # f. María asistió a una
    ],
)
def test_07_ejercicio_3(client: TestClient, formula: str, value: bool) -> None:
    check(evaluate(client, SCHOOL, formula), value)


def test_07_ejercicio_3_testigo_profesor(client: TestClient) -> None:
    check(evaluate(client, SCHOOL, "∃x(P(x) ∧ A(x, m))"), True, "testigo", [("x", "rojas")])


# Suma y producto con símbolos funcionales: ∀x∀yP(x, S(x, y)). En un dominio finito la
# suma y el producto se truncan en 3 para que sean funciones de 𝒟² en 𝒟.
def _truncated(op: Any) -> dict[tuple[str, ...], str]:
    return {(a, b): str(min(op(int(a), int(b)), 3)) for a in ORDER for b in ORDER}


ARITHMETIC = project(
    ORDER,
    functions={"S": _truncated(lambda a, b: a + b), "Q": _truncated(lambda a, b: a * b)},
    predicates={"P": LEQ},
)


def test_07_suma_es_mayor_o_igual_que_sus_partes(client: TestClient) -> None:
    check(evaluate(client, ARITHMETIC, "∀x∀yP(x, S(x, y))"), True, "comprobación completa")


def test_07_producto_no_es_mayor_o_igual(client: TestClient) -> None:
    # x = 1, y = 0: 1 · 0 = 0 y 1 ≤ 0 es falso.
    data = evaluate(client, ARITHMETIC, "∀x∀yP(x, Q(x, y))")
    check(data, False, "contraejemplo", [("x", "1"), ("y", "0")])


# Ejercicio 4: 𝒞 = {m}, ℱ = {f(t)}, ℛ = {S(t1, t2), B(t1, t2)}. ¿Cuáles son fórmulas?
EXERCISE_4 = {
    "constants": ["m"],
    "functions": [{"name": "f", "arity": 1}],
    "predicates": [{"name": "S", "arity": 2}, {"name": "B", "arity": 2}],
}


@pytest.mark.parametrize(
    ("formula", "codes"),
    [
        ("S(m, x)", []),
        ("B(m, f(m))", []),
        ("f(m)", ["E-SYM-002"]),
        ("B(B(m, x), y)", ["E-SYM-002"]),
        ("S(B(m), z)", ["E-SYM-002"]),
        ("B(x, y) → (∃z S(z, y))", []),
        ("S(x, y) → S(y, f(f(x)))", []),
        ("B(x) → B(B(x))", ["E-ARI-001", "E-ARI-001", "E-SYM-002"]),
    ],
)
def test_07_ejercicio_4(client: TestClient, formula: str, codes: list[str]) -> None:
    data = client.post(
        "/api/formula/analyze", json={"language": EXERCISE_4, "formula": formula}
    ).json()
    assert [d["code"] for d in data["diagnostics"]] == codes
    assert data["ok"] is (codes == [])


# Teoría de conjuntos: ⊆ como predicado Sub, ∅, A, B constantes y ∩, ∪, − funciones.
# 𝒟 = subconjuntos de {1, 2}.
SETS = {"v": frozenset(), "u": frozenset({1}), "d": frozenset({2}), "ud": frozenset({1, 2})}
NAME = {s: n for n, s in SETS.items()}
SET_THEORY = project(
    list(SETS),
    constants={"vacio": "v", "A": "u", "B": "d"},
    functions={
        "inter": {(a, b): NAME[SETS[a] & SETS[b]] for a in SETS for b in SETS},
        "union": {(a, b): NAME[SETS[a] | SETS[b]] for a in SETS for b in SETS},
        "dif": {(a, b): NAME[SETS[a] - SETS[b]] for a in SETS for b in SETS},
    },
    predicates={"Sub": [(a, b) for a in SETS for b in SETS if SETS[a] <= SETS[b]]},
)


@pytest.mark.parametrize(
    ("formula", "value"),
    [
        ("∀xSub(x, union(x, vacio))", True),
        ("∀xSub(x, x)", True),
        ("Sub(inter(A, B), A)", True),
        ("Sub(A, inter(A, B))", False),  # {1} ⊄ ∅
        ("∀x∀y(union(x, y) = union(y, x))", True),
        ("∀x(dif(x, x) = vacio)", True),
    ],
)
def test_07_teoria_de_conjuntos(client: TestClient, formula: str, value: bool) -> None:
    check(evaluate(client, SET_THEORY, formula), value)


# ------------------------------------------------------------------ 08 Variables y sustituciones

UNARY_PQ = {"predicates": [{"name": "P", "arity": 1}, {"name": "Q", "arity": 1}]}
BINARY_PQ = {"predicates": [{"name": "P", "arity": 2}, {"name": "Q", "arity": 2}]}
BINARY_PQS = {
    "predicates": [
        {"name": "P", "arity": 1},
        {"name": "Q", "arity": 1},
        {"name": "S", "arity": 2},
    ]
}


@pytest.mark.parametrize(
    ("language", "formula", "free"),
    [
        (BINARY_PQS, "∀x((P(x) → Q(x)) ∧ S(x, y))", ["y"]),
        (UNARY_PQ, "∀x(P(x) → ∃xQ(x))", []),  # ejemplo a
        (UNARY_PQ, "(∀x(P(x) ∧ Q(x))) → (¬P(x) ∨ Q(y))", ["x", "y"]),  # ejemplo b
        (BINARY_PQ, "∃x(P(y, z) ∧ ∀y(¬Q(y, x) ∨ P(y, z)))", ["y", "z"]),  # ejercicio 1
    ],
)
def test_08_variables_libres(
    client: TestClient, language: dict[str, Any], formula: str, free: list[str]
) -> None:
    data = client.post(
        "/api/formula/analyze", json={"language": language, "formula": formula}
    ).json()
    assert data["ok"], data["diagnostics"]
    assert data["free_vars"] == free


def test_08_ejemplo_b_x_libre_y_ligada(client: TestClient) -> None:
    formula = "(∀x(P(x) ∧ Q(x))) → (¬P(x) ∨ Q(y))"
    data = client.post(
        "/api/formula/analyze", json={"language": UNARY_PQ, "formula": formula}
    ).json()
    assert [(o["name"], o["free"]) for o in data["occurrences"]] == [
        ("x", False),
        ("x", False),
        ("x", True),
        ("y", True),
    ]


EXERCISE_1 = project(["a", "b"], predicates={"P": [("a", "b")], "Q": [("a", "a")]})


def test_08_ejercicio_1_con_entorno(client: TestClient) -> None:
    formula = "∃x(P(y, z) ∧ ∀y(¬Q(y, x) ∨ P(y, z)))"
    data = evaluate(client, EXERCISE_1, formula, {"y": "a", "z": "b"})
    check(data, True, "testigo", None)
    assert data["free_vars"] == ["y", "z"]


def test_08_ejercicio_1_sin_entorno_no_tiene_valor(client: TestClient) -> None:
    data = evaluate(client, EXERCISE_1, "∃x(P(y, z) ∧ ∀y(¬Q(y, x) ∨ P(y, z)))")
    assert data["value"] is None
    assert [d["code"] for d in data["diagnostics"]] == ["E-ENV-001", "E-ENV-001"]


# ------------------------------------------------------------------ 10 Interpretaciones

NUMBERS = project(
    ["1", "2", "3"],
    predicates={"P": [("1",), ("2",)], "R": [("1", "3"), ("2", "1"), ("3", "2")]},
)
LETTERS = project(
    ["a", "b", "c"],
    constants={"i": "a"},
    predicates={
        "R": [("b",), ("c",)],
        "Q": [("a", "a"), ("a", "b"), ("a", "c"), ("b", "c"), ("c", "c")],
    },
)


@pytest.mark.parametrize(
    ("base", "formula", "value", "justification", "path"),
    [
        (NUMBERS, "∀xP(x)", False, "contraejemplo", [("x", "3")]),
        (NUMBERS, "∀x∃yR(x, y)", True, "comprobación completa", []),
        (NUMBERS, "∀x∀y(P(x) → R(x, y))", False, "contraejemplo", [("x", "1"), ("y", "1")]),
        (LETTERS, "∃yQ(i, y)", True, "testigo", [("y", "a")]),
        (LETTERS, "¬R(i)", True, None, []),
        (
            LETTERS,
            "∀x∀y∀z(Q(x, y) ∧ Q(x, z) → y = z)",
            False,
            "contraejemplo",
            [("x", "a"), ("y", "a"), ("z", "b")],
        ),
        (LETTERS, "∀x∃yQ(x, y)", True, "comprobación completa", []),
    ],
)
def test_10_interpretaciones(
    client: TestClient,
    base: Project,
    formula: str,
    value: bool,
    justification: str | None,
    path: Any,
) -> None:
    check(evaluate(client, base, formula), value, justification, path)


# Segundo ejemplo: cadenas binarias con concatenación y "ser prefijo". Σ* es infinito, así
# que se toman las cadenas de largo ≤ 2 y la concatenación se trunca en 2 caracteres.
STRINGS = ["", "0", "1", "00", "01", "10", "11"]
LABEL = {s: s or "e" for s in STRINGS}
CONCAT = {(LABEL[a], LABEL[b]): LABEL[(a + b)[:2]] for a in STRINGS for b in STRINGS}
PREFIX = [(LABEL[a], LABEL[b]) for a in STRINGS for b in STRINGS if b.startswith(a)]
WORDS = project(
    list(LABEL.values()), constants={"e": "e"}, functions={"f": CONCAT}, predicates={"R": PREFIX}
)


@pytest.mark.parametrize(
    ("formula", "value"),
    [
        ("∀x(R(x, f(x, e)) ∧ R(f(x, e), x))", True),  # x·ε = x
        ("∃y∀xR(y, x)", True),  # la cadena vacía es prefijo de todas
        # Falsa también sin truncar: ε es prefijo de 0, pero 1 = ε·1 no lo es de 01 = 0·1.
        ("∀x∀y∀z(R(x, y) → R(f(x, z), f(y, z)))", False),
    ],
)
def test_10_cadenas(client: TestClient, formula: str, value: bool) -> None:
    check(evaluate(client, WORDS, formula), value)


def test_10_cadena_vacia_es_testigo(client: TestClient) -> None:
    check(evaluate(client, WORDS, "∃y∀xR(y, x)"), True, "testigo", [("y", "e")])


# ------------------------------------------------------------------ 11 Entornos

ORDER_012 = project(["0", "1", "2"], predicates={"P": [("0", "1"), ("0", "2"), ("1", "2")]})


@pytest.mark.parametrize(
    ("environment", "value"),
    [({"x": "0", "y": "2"}, True), ({"x": "2", "y": "1"}, False)],  # incisos a y b
)
def test_11_entornos(client: TestClient, environment: dict[str, str], value: bool) -> None:
    check(evaluate(client, ORDER_012, "P(x, y)", environment), value)


def test_11_inciso_c(client: TestClient) -> None:
    check(evaluate(client, ORDER_012, "∃x∀yP(x, y)"), False, "comprobación completa")


# Implicación semántica: ¿∀x(P(x) → Q(x)) es implicación semántica de ∀xP(x) → ∀xQ(x)?
# No: en este contramodelo la premisa es verdadera y la conclusión falsa.
COUNTERMODEL = project(["a", "b"], predicates={"P": [("a",)], "Q": [("b",)]})


def test_11_implicacion_semantica_contramodelo(client: TestClient) -> None:
    check(evaluate(client, COUNTERMODEL, "∀xP(x) → ∀xQ(x)"), True)
    check(evaluate(client, COUNTERMODEL, "∀x(P(x) → Q(x))"), False, "contraejemplo", [("x", "a")])


def test_11_validez_b_tiene_contramodelo(client: TestClient) -> None:
    data = evaluate(client, COUNTERMODEL, "∀x(P(x) ∨ Q(x)) → (∀xP(x) ∨ ∀xQ(x))")
    check(data, False)


VALIDITY_A = "(∀x(P(x) → ∃y Q(y))) → (∀x∃y(P(x) → Q(y)))"


@pytest.mark.parametrize(
    "relations",
    [
        # Es válida: verdadera en toda interpretación. Se prueba en todas las de 𝒟 = {a, b}.
        (p, q)
        for p in [[("a",)], [("b",)], [("a",), ("b",)]]
        for q in [[("a",)], [("b",)], [("a",), ("b",)]]
    ],
)
def test_11_validez_a_es_verdadera_en_toda_interpretacion(
    client: TestClient, relations: tuple[list[tuple[str]], list[tuple[str]]]
) -> None:
    base = project(["a", "b"], predicates={"P": relations[0], "Q": relations[1]})
    check(evaluate(client, base, VALIDITY_A), True)


# ------------------------------------------------------------------ variantes y validación


def test_teclado_ascii_igual_que_simbolos(client: TestClient) -> None:
    unicode = evaluate(client, SOCRATES, "∀x(H(x) → M(x))")
    ascii_ = evaluate(client, SOCRATES, "forall x (H(x) -> M(x))")
    assert unicode["value"] is ascii_["value"] is True
    assert unicode["parenthesized"] == ascii_["parenthesized"]


def test_sombreado_de_variables(client: TestClient) -> None:
    # La x de ∃x es otra: ∀x(H(x) → ∃x¬H(x)) es verdadera porque fido no es hombre.
    check(evaluate(client, SOCRATES, "∀x(H(x) → ∃x¬H(x))"), True)


def test_cuantificador_sin_efecto_es_advertencia(client: TestClient) -> None:
    data = evaluate(client, SOCRATES, "∀yH(s)")
    check(data, True)
    assert [d["code"] for d in data["diagnostics"]] == ["W-QNT-001"]


@pytest.mark.parametrize(
    ("change", "formula", "environment", "code"),
    [
        ({}, "∀x(H(x) → M(x)", {}, "E-SYN-002"),  # paréntesis sin cerrar
        ({}, "∀xF(x)", {}, "E-SYM-001"),  # símbolo no declarado
        ({}, "H(s, s)", {}, "E-ARI-001"),  # aridad
        ({}, "H(x)", {}, "E-ENV-001"),  # variable libre sin asignar
        ({}, "H(x)", {"x": "zeus"}, "E-ENV-002"),  # valor fuera de 𝒟
        ({"domain": []}, "H(s)", {}, "E-DOM-001"),  # dominio vacío
        ({"domain": ["soc", "soc"]}, "H(s)", {}, "E-DOM-002"),  # elemento repetido
        ({"constants": {}}, "H(s)", {}, "E-CON-001"),  # constante sin valor
        ({"predicates": {"H": [], "M": [["soc"]]}}, "H(s)", {}, "E-REL-001"),  # relación vacía
        ({"predicates": {"H": [["soc", "pla"]], "M": [["soc"]]}}, "H(s)", {}, "E-REL-002"),
        ({"predicates": {"H": [["zeus"]], "M": [["soc"]]}}, "H(s)", {}, "E-REL-003"),
    ],
)
def test_entradas_invalidas_no_reciben_valor(
    client: TestClient,
    change: dict[str, Any],
    formula: str,
    environment: dict[str, str],
    code: str,
) -> None:
    base = {**SOCRATES, "interpretation": {**SOCRATES["interpretation"], **change}}
    data = evaluate(client, base, formula, environment)
    assert data["value"] is None
    assert code in [d["code"] for d in data["diagnostics"]]


def test_funcion_incompleta_no_recibe_valor(client: TestClient) -> None:
    table = dict(itertools.islice(CONCAT.items(), 10))  # faltan 39 de 49 valores
    base = project(list(LABEL.values()), functions={"f": table}, predicates={"R": PREFIX})
    data = evaluate(client, base, "∀xR(x, x)")
    assert data["value"] is None
    assert "E-FUN-001" in [d["code"] for d in data["diagnostics"]]
