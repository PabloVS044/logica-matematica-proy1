"""Verbalización: convierte una fórmula en español hablado.

Es la operación inversa de `speech.translate`. Se usa para leer en voz alta lo que
se dictó y como oráculo de pruebas: `translate(verbalize(φ)) == φ`.

Reglas de alcance (las mismas precedencias que `printer`):

- Donde el texto escrito lleva paréntesis se dice "abre paréntesis … cierra paréntesis".
- Un cuantificador o una negación cuyo cuerpo es binario usa la forma de alcance amplio
  ("para todo x tal que …", "no es cierto que …") solo si nada lo sigue dentro de su grupo;
  si algo lo sigue, el cuerpo va entre paréntesis.

Con `spell=True` los nombres de una letra se dicen con su nombre en español
("pe", "equis", "i griega"), lo que conviene a un sintetizador de voz.
"""

from collections.abc import Collection

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

# Nombre en español de cada letra (sin tilde ni mayúsculas).
LETTER_NAMES: dict[str, str] = {
    "a": "a",
    "b": "be",
    "c": "ce",
    "d": "de",
    "e": "e",
    "f": "efe",
    "g": "ge",
    "h": "hache",
    "i": "i",
    "j": "jota",
    "k": "ka",
    "l": "ele",
    "m": "eme",
    "n": "ene",
    "o": "o",
    "p": "pe",
    "q": "cu",
    "r": "erre",
    "s": "ese",
    "t": "te",
    "u": "u",
    "v": "uve",
    "w": "doble ve",
    "x": "equis",
    "y": "i griega",
    "z": "zeta",
}

_IMPLIES, _OR, _AND, _UNARY, _ATOM = 1, 2, 3, 4, 5
_OPEN, _CLOSE = "abre paréntesis", "cierra paréntesis"


def verbalize(formula: Formula, *, spell: bool = False, names: Collection[str] = ()) -> str:
    """`names`: símbolos declarados; si dos se dicen igual (p y P), se agrega «mayúscula»
    o «minúscula» para distinguirlos."""
    return " ".join(_Verbalizer(spell, names).formula(formula, tail=True))


def verbalize_term(term: Term, *, spell: bool = False, names: Collection[str] = ()) -> str:
    return " ".join(_Verbalizer(spell, names).term(term))


def spoken_name(name: str) -> str:
    """Cómo se pronuncia un nombre: "y" → "i griega", "x1" → "equis 1", "Even" → "Even"."""
    return _Verbalizer(spell=True).name(name)


def _precedence(formula: Formula) -> int:
    match formula:
        case Implies():
            return _IMPLIES
        case Or():
            return _OR
        case And():
            return _AND
        case Not() | ForAll() | Exists():
            return _UNARY
        case Eq() | Pred():
            return _ATOM


def _is_binary(formula: Formula) -> bool:
    return isinstance(formula, And | Or | Implies)


def _needs_case(name: str, declared: Collection[str]) -> bool:
    """Una letra cuyo caso no se oye: X (que se confundiría con la variable x) o p cuando
    también existe P."""
    if len(name) != 1 or not name.isalpha():
        return False
    if name in "uvwxyz":
        return False  # una variable: sin la palabra, «x» siempre es la variable x
    if name.isupper() and name.lower() in "uvwxyz":
        return True
    return any(other != name and other.lower() == name.lower() for other in declared)


class _Verbalizer:
    def __init__(self, spell: bool, names: Collection[str] = ()) -> None:
        self.spell = spell
        self.declared = names

    def name(self, name: str) -> str:
        """Nombre de un símbolo o variable; x1 se dice "equis 1"."""
        case = ""
        if _needs_case(name, self.declared):
            case = " mayúscula" if name.isupper() else " minúscula"
        return self.spelled(name) + case

    def spelled(self, name: str) -> str:
        if not self.spell:
            return name
        head, digits = name[0], name[1:]
        if len(name) == 1 or (digits.isdigit() and head.islower()):
            spoken = LETTER_NAMES.get(head.lower(), head)
            return f"{spoken} {digits}" if digits else spoken
        return name

    def term(self, term: Term) -> list[str]:
        match term:
            case Var(name) | Const(name):
                return [self.name(name)]
            case Func(name, args):
                return [self.name(name), *self.arguments(args)]

    def arguments(self, args: tuple[Term, ...]) -> list[str]:
        words = ["de"]
        for i, arg in enumerate(args):
            if i:
                words.append("coma")
            words += self.term(arg)
        return words

    def formula(self, formula: Formula, *, tail: bool) -> list[str]:
        match formula:
            case Pred(name, args):
                return [self.name(name), *self.arguments(args)]
            case Eq(left, right):
                return [*self.term(left), "es igual a", *self.term(right)]
            case Not(body):
                return self.prefixed(["no"], ["no es cierto que"], body, tail)
            case ForAll(var, body):
                head = ["para todo", self.name(var)]
                return self.prefixed(head, [*head, "tal que"], body, tail)
            case Exists(var, body):
                head = ["existe", self.name(var)]
                return self.prefixed(head, [*head, "tal que"], body, tail)
            case And(left, right):
                return self.binary(left, "y", right, _AND, tail, right_assoc=False)
            case Or(left, right):
                return self.binary(left, "o", right, _OR, tail, right_assoc=False)
            case Implies(left, right):
                return self.binary(left, "implica", right, _IMPLIES, tail, right_assoc=True)

    def prefixed(self, tight: list[str], wide: list[str], body: Formula, tail: bool) -> list[str]:
        if not _is_binary(body):
            return [*tight, *self.formula(body, tail=tail)]
        if tail:
            return [*wide, *self.formula(body, tail=True)]
        return [*tight, _OPEN, *self.formula(body, tail=True), _CLOSE]

    def binary(
        self,
        left: Formula,
        op: str,
        right: Formula,
        prec: int,
        tail: bool,
        *,
        right_assoc: bool,
    ) -> list[str]:
        left_min = prec + 1 if right_assoc else prec
        right_min = prec if right_assoc else prec + 1
        return [
            *self.operand(left, left_min, tail=False),
            op,
            *self.operand(right, right_min, tail=tail),
        ]

    def operand(self, formula: Formula, min_prec: int, *, tail: bool) -> list[str]:
        if _precedence(formula) < min_prec:
            return [_OPEN, *self.formula(formula, tail=True), _CLOSE]
        return self.formula(formula, tail=tail)
