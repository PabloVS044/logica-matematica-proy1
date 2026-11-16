from evaluador.core.environment import Environment
from evaluador.core.explain import explain
from evaluador.core.parser import parse
from evaluador.core.spoken import spoken_verdict
from evaluador.core.verbalize import spoken_name

from .test_course_examples import LETTERS, ORDER
from .test_semantics import MOD3


def verdict(text: str, interp=LETTERS, env: dict[str, str] | None = None) -> str:  # type: ignore[no-untyped-def]
    return spoken_verdict(explain(parse(text), interp, Environment(env or {})).root)


def test_counterexample() -> None:
    text = verdict("∀x ∀y ∀z (Q(x, y) ∧ Q(x, z) → y = z)")
    assert text.startswith("Falso. La fórmula para todo equis para todo i griega")
    assert "Contraejemplo: equis vale a, i griega vale a, zeta vale b." in text
    assert text.endswith("es falsa.")
    assert "⊨" not in text and "_{" not in text


def test_witness() -> None:
    text = verdict("∃y Q(i, y)")
    assert "Testigo: i griega vale a." in text
    assert text.endswith("Ahí, cu de i coma i griega es verdadera.")


def test_full_check() -> None:
    assert verdict("∃x ∀y P(x, y)", ORDER).endswith("Se comprobó con cada elemento del dominio.")


def test_environment_is_read() -> None:
    text = verdict("P(x, y)", ORDER, {"x": "0", "y": "2"})
    assert text == (
        "Verdadero. La fórmula pe de equis coma i griega es verdadera, "
        "con equis igual a 0, i griega igual a 2."
    )


def test_mixed_choices() -> None:
    assert "Elecciones decisivas: equis vale 0, i griega vale 0." in verdict("∃x ¬∀y L(x, y)", MOD3)


def test_spoken_name() -> None:
    assert spoken_name("y") == "i griega"
    assert spoken_name("x1") == "equis 1"
    assert spoken_name("Even") == "Even"
