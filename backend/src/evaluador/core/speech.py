"""Traducción de español hablado a fórmulas ("para todo x, P de x implica Q de x").

Es un parser descendente recursivo con la misma gramática y precedencia que `parser.py`,
pero sobre palabras habladas. Tres ideas resuelven las ambigüedades del español:

1. **El contexto decide.** "y" es la variable y cuando se espera un término, y el
   conectivo ∧ cuando se espera un conectivo. Igual con "o", "u", "e" y "de".
2. **La signatura decide los nombres.** "pe" o "P" se resuelve como el predicado P si
   está declarado; los argumentos se leen según la aridad declarada, así que no hace
   falta decir dónde termina "R de x coma y".
3. **El alcance se dice.** "abre/cierra paréntesis" agrupa; "tal que" (o una coma
   después de la variable) y "no es cierto que" alcanzan hasta el final del grupo.

`verbalize.verbalize` hace lo contrario y las pruebas verifican que
`translate(verbalize(φ)) == φ`.
"""

import difflib
import re
import unicodedata
from dataclasses import dataclass, field
from enum import StrEnum
from typing import NoReturn

from evaluador.core.errors import Diagnostic, Location, Span
from evaluador.core.language import Signature, SymbolKind
from evaluador.core.lexer import is_identifier_name, is_variable_name
from evaluador.core.printer import format_formula
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
from evaluador.core.verbalize import LETTER_NAMES


class Word(StrEnum):
    """Significado de una palabra o frase clave."""

    FORALL = "para todo"
    EXISTS = "existe"
    NOT = "no"
    NOT_WIDE = "no es cierto que"
    AND = "y"
    OR = "o"
    IMPLIES = "implica"
    IF = "si"
    EQ = "es igual a"
    NEQ = "es distinto de"
    OF = "de"
    COMMA = "coma"
    LPAREN = "abre paréntesis"
    RPAREN = "cierra paréntesis"
    SUCH_THAT = "tal que"


# Frases normalizadas (minúsculas, sin tildes). Se aplica la coincidencia más larga.
_PHRASES: dict[str, Word] = {
    "para todo": Word.FORALL,
    "para toda": Word.FORALL,
    "para todos": Word.FORALL,
    "para todas": Word.FORALL,
    "para cada": Word.FORALL,
    "por cada": Word.FORALL,
    "forall": Word.FORALL,
    "existe": Word.EXISTS,
    "existen": Word.EXISTS,
    "existe un": Word.EXISTS,
    "existe una": Word.EXISTS,
    "existe algun": Word.EXISTS,
    "existe alguna": Word.EXISTS,
    "hay un": Word.EXISTS,
    "hay una": Word.EXISTS,
    "hay algun": Word.EXISTS,
    "hay alguna": Word.EXISTS,
    "para algun": Word.EXISTS,
    "para alguna": Word.EXISTS,
    "exists": Word.EXISTS,
    "no": Word.NOT,
    "negacion de": Word.NOT,
    "no es cierto que": Word.NOT_WIDE,
    "no es verdad que": Word.NOT_WIDE,
    "no se cumple que": Word.NOT_WIDE,
    "y": Word.AND,
    "e": Word.AND,
    "o": Word.OR,
    "u": Word.OR,
    "o bien": Word.OR,
    "implica": Word.IMPLIES,
    "implica que": Word.IMPLIES,
    "entonces": Word.IMPLIES,
    "si": Word.IF,
    "es igual a": Word.EQ,
    "es igual que": Word.EQ,
    "es igual": Word.EQ,
    "igual a": Word.EQ,
    "igual que": Word.EQ,
    "igual": Word.EQ,
    "=": Word.EQ,
    "es distinto de": Word.NEQ,
    "es distinta de": Word.NEQ,
    "distinto de": Word.NEQ,
    "distinta de": Word.NEQ,
    "es diferente de": Word.NEQ,
    "diferente de": Word.NEQ,
    "no es igual a": Word.NEQ,
    "de": Word.OF,
    "aplicado a": Word.OF,
    "aplicada a": Word.OF,
    "coma": Word.COMMA,
    ",": Word.COMMA,
    "abre parentesis": Word.LPAREN,
    "abrir parentesis": Word.LPAREN,
    "abre": Word.LPAREN,
    "(": Word.LPAREN,
    "cierra parentesis": Word.RPAREN,
    "cerrar parentesis": Word.RPAREN,
    "cierra": Word.RPAREN,
    ")": Word.RPAREN,
    "tal que": Word.SUCH_THAT,
    "tales que": Word.SUCH_THAT,
    "se cumple que": Word.SUCH_THAT,
}

# Nombres de letra de varias palabras; los de una sola palabra salen de LETTER_NAMES.
_LETTER_PHRASES: dict[str, str] = {
    "i griega": "y",
    "ye": "y",
    "doble ve": "w",
    "doble u": "w",
    "uve doble": "w",
    "ve": "v",
    "seta": "z",
    "ceta": "z",
    "ere": "r",
}
_LETTERS: dict[str, str] = {
    **{spoken: letter for letter, spoken in LETTER_NAMES.items()},
    **_LETTER_PHRASES,
}

_NUMBERS = {
    "cero": "0",
    "uno": "1",
    "dos": "2",
    "tres": "3",
    "cuatro": "4",
    "cinco": "5",
    "seis": "6",
    "siete": "7",
    "ocho": "8",
    "nueve": "9",
    "diez": "10",
}

_MAX_PHRASE = max(len(p.split()) for p in [*_PHRASES, *_LETTERS])
_RAW_WORD = re.compile(r"[A-Za-zÀ-ÿ0-9_₀-₉]+|[,()=]")


def normalize(text: str) -> str:
    """Minúsculas y sin tildes (conserva la ñ)."""
    text = text.lower().replace("ñ", "\0")
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return text.replace("\0", "ñ")


# ------------------------------------------------------------------ palabras habladas


@dataclass(frozen=True, slots=True)
class SpokenToken:
    text: str  # tal como se transcribió
    norm: str  # normalizado
    span: Span  # posición en la transcripción
    word: Word | None  # significado como palabra clave, si lo tiene
    names: tuple[str, ...]  # nombres que podría representar ("pe" → "p")
    exact: bool = False  # se dijo «mayúscula» o «minúscula»: el nombre es exactamente ese


_CASE_WORDS = {
    "mayuscula": str.upper,
    "mayusculas": str.upper,
    "minuscula": str.lower,
    "minusculas": str.lower,
}


def tokenize(transcript: str) -> list[SpokenToken]:
    raw = [
        (m.group(), normalize(m.group()), Span(m.start(), m.end()))
        for m in _RAW_WORD.finditer(transcript)
    ]
    tokens: list[SpokenToken] = []
    i = 0
    while i < len(raw):
        for size in range(min(_MAX_PHRASE, len(raw) - i), 0, -1):
            group = raw[i : i + size]
            norm = " ".join(g[1] for g in group)
            word = _PHRASES.get(norm)
            letter = _LETTERS.get(norm)
            if size > 1 and word is None and letter is None:
                continue
            text = transcript[group[0][2].start : group[-1][2].end]
            span = Span(group[0][2].start, group[-1][2].end)
            names: tuple[str, ...] = ()
            if size == 1:
                original = group[0][0]
                names = (original,) if letter is None else (original, letter)
            elif letter is not None:
                names = (letter,)
            token = SpokenToken(
                text, norm, span, word if size == 1 or letter is None else None, names
            )
            i += size
            # «pe mayúscula», «q minúscula»: fija el caso de una letra.
            letter_name = names[-1] if names else ""
            if i < len(raw) and raw[i][1] in _CASE_WORDS and len(letter_name) == 1:
                forced = _CASE_WORDS[raw[i][1]](letter_name)
                end = raw[i][2].end
                token = SpokenToken(
                    transcript[span.start : end],
                    f"{norm} {raw[i][1]}",
                    Span(span.start, end),
                    None,
                    (forced,),
                    exact=True,
                )
                i += 1
            tokens.append(token)
            break
    return tokens


# ------------------------------------------------------------------ resultado


class Role(StrEnum):
    """Cómo se interpretó cada palabra (para colorear la transcripción)."""

    KEYWORD = "palabra clave"
    SYMBOL = "símbolo"
    VARIABLE = "variable"
    UNKNOWN = "desconocida"


@dataclass(frozen=True, slots=True)
class TokenMark:
    text: str
    span: Span
    role: Role
    meaning: str  # p. ej. "∀", "P", "x", "∧"


@dataclass(frozen=True, slots=True)
class SymbolProposal:
    """Símbolo que falta declarar para que lo dictado tenga sentido.

    Se propone si, al declararlo, la frase se traduce completa (`formula`) o la traducción
    avanza hasta otro símbolo que también falta (`formula` es None y se propondrá después).
    """

    name: str
    kind: SymbolKind
    arity: int  # 0 para constantes
    formula: str | None


@dataclass(frozen=True, slots=True)
class Translation:
    formula: Formula | None
    text: str | None  # fórmula escrita (paréntesis mínimos)
    marks: list[TokenMark]
    diagnostics: list[Diagnostic] = field(default_factory=list)
    proposal: SymbolProposal | None = None

    @property
    def ok(self) -> bool:
        return self.formula is not None


class _SpeechError(Exception):
    def __init__(self, diagnostic: Diagnostic) -> None:
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic


class _UnknownWord(_SpeechError):
    """Palabra que no es variable ni símbolo declarado.

    `expected` son los tipos de símbolo que encajarían ahí: con argumentos, un predicado al
    inicio de una fórmula atómica (o una función, si es una ecuación) y una función dentro de
    un término; sin argumentos, una constante.
    """

    def __init__(
        self, diagnostic: Diagnostic, index: int, expected: tuple[SymbolKind, ...]
    ) -> None:
        super().__init__(diagnostic)
        self.index = index
        self.expected = expected  # en orden de preferencia


def translate(transcript: str, signature: Signature) -> Translation:
    """Traduce la transcripción a una fórmula del lenguaje declarado."""
    tokens = tokenize(transcript)
    parser = _SpeechParser(tokens, signature)
    if not tokens:
        diagnostic = Diagnostic(
            "E-SPK-004",
            "No se oyó ninguna fórmula.",
            Location("speech", Span(0, len(transcript))),
        )
        return Translation(None, None, [], [diagnostic])
    try:
        formula = parser.parse()
    except _UnknownWord as error:
        token = tokens[error.index]
        proposal = _propose(transcript, signature, token, error.expected)
        kind = proposal.kind if proposal else error.expected[0]
        message = _unknown_message(tokens, error.index, signature, kind, proposal)
        diagnostic = Diagnostic("E-SPK-001", message, error.diagnostic.location)
        return Translation(None, None, parser.marks(), [diagnostic], proposal)
    except _SpeechError as error:
        return Translation(None, None, parser.marks(), [error.diagnostic])
    return Translation(formula, format_formula(formula), parser.marks())


# ------------------------------------------------------------------ símbolos sin declarar

_KIND_PLURAL = {
    SymbolKind.CONSTANT: "Las constantes declaradas son",
    SymbolKind.FUNCTION: "Los símbolos funcionales declarados son",
    SymbolKind.PREDICATE: "Los predicados declarados son",
}
_KIND_NONE_OF = {
    SymbolKind.CONSTANT: "ninguna constante",
    SymbolKind.FUNCTION: "ningún símbolo funcional",
    SymbolKind.PREDICATE: "ningún predicado",
}
_KIND_NONE = {
    SymbolKind.CONSTANT: "No hay constantes declaradas.",
    SymbolKind.FUNCTION: "No hay símbolos funcionales declarados.",
    SymbolKind.PREDICATE: "No hay predicados declarados.",
}
_MAX_PROPOSED_ARITY = 4


def _spanish_list(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} y {items[-1]}"


def _declared(signature: Signature, kind: SymbolKind) -> list[str]:
    return [name for name in signature.all_names() if signature.kind_of(name) is kind]


def _unknown_message(
    tokens: list[SpokenToken],
    index: int,
    signature: Signature,
    kind: SymbolKind,
    proposal: SymbolProposal | None,
) -> str:
    """Explica qué falta: qué se esperaba, qué símbolos existen y cuál se parece."""
    token = tokens[index]
    name = proposal.name if proposal else (_proposed_name(token, kind) or token.text)
    parts = [f"«{token.text}» no es un símbolo del lenguaje: no hay {_KIND_NONE_OF[kind]} {name}."]
    declared = _declared(signature, kind)
    if declared:
        parts.append(f"{_KIND_PLURAL[kind]} {_spanish_list(declared)}.")
    else:
        parts.append(_KIND_NONE[kind])
    similar = _similar(tokens, index, signature.all_names())
    if similar:
        parts.append(f"¿Quisiste decir «{similar}»?")
    return " ".join(parts)


def _similar(tokens: list[SpokenToken], index: int, declared: list[str]) -> str | None:
    """Símbolo declarado que se parece a lo dicho; prueba también juntando las palabras
    siguientes ("is evn" → isEven). Solo nombres de más de una letra: entre letras sueltas
    cualquier par se "parece"."""
    simple = {_simplify(d): d for d in declared if len(d) > 1}
    spoken = ""
    for token in tokens[index : index + 3]:
        if token.word is not None:
            break
        spoken += _simplify(token.text)
        close = difflib.get_close_matches(spoken, list(simple), n=1, cutoff=0.75)
        if close:
            return simple[close[0]]
    return None


def _proposed_name(token: SpokenToken, kind: SymbolKind) -> str | None:
    """Nombre para declarar: una letra dicha por su nombre ("cu" → Q); los predicados de
    una letra van en mayúscula y las funciones y constantes en minúscula, como en el curso."""
    if not token.names:
        return None
    base = token.names[-1]
    if len(base) == 1 and not token.exact:
        base = base.upper() if kind is SymbolKind.PREDICATE else base.lower()
    return base if is_identifier_name(base) else None


def _extended(signature: Signature, name: str, kind: SymbolKind, arity: int) -> Signature:
    if kind is SymbolKind.CONSTANT:
        return Signature(signature.constants | {name}, signature.functions, signature.predicates)
    if kind is SymbolKind.FUNCTION:
        return Signature(
            signature.constants, {**signature.functions, name: arity}, signature.predicates
        )
    return Signature(
        signature.constants, signature.functions, {**signature.predicates, name: arity}
    )


def _propose(
    transcript: str, signature: Signature, token: SpokenToken, kinds: tuple[SymbolKind, ...]
) -> SymbolProposal | None:
    """Prueba a declarar la palabra con cada tipo posible (y aridad 1, 2, …) y propone lo
    primero que deja la frase completa traducida."""
    index = tokenize(transcript).index(token)
    partial: SymbolProposal | None = None
    for kind in kinds:
        name = _proposed_name(token, kind)
        if name is None or signature.kind_of(name) is not None:
            continue
        arities = [0] if kind is SymbolKind.CONSTANT else range(1, _MAX_PROPOSED_ARITY + 1)
        for arity in arities:
            formula, unknown_at = _parse_only(transcript, _extended(signature, name, kind, arity))
            if formula is not None:
                return SymbolProposal(name, kind, arity, format_formula(formula))
            if partial is None and unknown_at is not None and unknown_at > index:
                partial = SymbolProposal(name, kind, arity, None)
    return partial


def _parse_only(transcript: str, signature: Signature) -> tuple[Formula | None, int | None]:
    """(fórmula, None) si se traduce; (None, posición) si falla en otra palabra desconocida."""
    try:
        return _SpeechParser(tokenize(transcript), signature).parse(), None
    except _UnknownWord as error:
        return None, error.index
    except _SpeechError:
        return None, None


# ------------------------------------------------------------------ parser

_SYMBOL_WORDS = {
    Word.FORALL: "∀",
    Word.EXISTS: "∃",
    Word.NOT: "¬",
    Word.NOT_WIDE: "¬",
    Word.AND: "∧",
    Word.OR: "∨",
    Word.IMPLIES: "→",
    Word.IF: "si … →",
    Word.EQ: "=",
    Word.NEQ: "≠",
    Word.OF: "(",
    Word.COMMA: ",",
    Word.LPAREN: "(",
    Word.RPAREN: ")",
    Word.SUCH_THAT: "tal que",
}


class _SpeechParser:
    def __init__(self, tokens: list[SpokenToken], signature: Signature) -> None:
        self.tokens = tokens
        self.signature = signature
        self.pos = 0
        self.roles: dict[int, tuple[Role, str]] = {}

    # ------------------------------------------------------------ utilidades

    def marks(self) -> list[TokenMark]:
        return [
            TokenMark(t.text, t.span, *self.roles.get(i, (Role.UNKNOWN, "")))
            for i, t in enumerate(self.tokens)
        ]

    def peek(self, offset: int = 0) -> SpokenToken | None:
        index = self.pos + offset
        return self.tokens[index] if index < len(self.tokens) else None

    def at(self, *words: Word, offset: int = 0) -> bool:
        token = self.peek(offset)
        return token is not None and token.word in words

    def take(self, role: Role, meaning: str, count: int = 1) -> None:
        for _ in range(count):
            self.roles[self.pos] = (role, meaning)
            self.pos += 1

    def keyword(self, meaning: str | None = None) -> Word:
        token = self.tokens[self.pos]
        assert token.word is not None
        self.take(Role.KEYWORD, meaning or _SYMBOL_WORDS[token.word])
        return token.word

    def fail(self, code: str, message: str, span: Span | None = None) -> NoReturn:
        if span is None:
            token = self.peek()
            end = self.tokens[-1].span.end if self.tokens else 0
            span = token.span if token else Span(end, end)
        raise _SpeechError(Diagnostic(code, message, Location("speech", span)))

    def expected(self, what: str) -> NoReturn:
        token = self.peek()
        if token is None:
            self.fail("E-SPK-002", f"La fórmula quedó incompleta: faltó {what}.")
        self.fail("E-SPK-002", f"Se esperaba {what}, pero se oyó «{token.text}».")

    # ------------------------------------------------------------ nombres

    def symbol(self, kinds: set[SymbolKind]) -> tuple[str, SymbolKind, int] | None:
        """Símbolo declarado que empieza en la posición actual: (nombre, tipo, palabras).

        Acepta el nombre tal cual, su nombre de letra ("pe" → P) sin importar
        mayúsculas, y nombres de varias palabras ("is even" → isEven).
        """
        declared = {
            name: kind
            for name in self.signature.all_names()
            if (kind := self.signature.kind_of(name)) in kinds
        }
        token = self.peek()
        if token is None:
            return None
        if token.exact:  # se dijo «mayúscula» o «minúscula»: solo ese nombre exacto
            name = token.names[0]
            return (name, declared[name], 1) if name in declared else None
        for candidate in token.names:
            if is_variable_name(candidate.lower()):
                continue  # "x" es la variable x, aunque exista un símbolo X
            # p y P declarados a la vez: el reconocedor no distingue mayúsculas, se pregunta.
            same = [name for name in declared if _simplify(name) == _simplify(candidate)]
            if len(same) > 1:
                self.ambiguous(token, sorted(same))
            if same:
                return same[0], declared[same[0]], 1
        simple = {_simplify(name): name for name in declared}
        for size in range(3, 1, -1):
            group = [self.peek(k) for k in range(size)]
            if any(t is None or not t.names for t in group):
                continue
            joined = "".join(_simplify(t.names[0]) for t in group if t is not None)
            match = simple.get(joined)
            if match is not None:
                return match, declared[match], size
        return None

    def ambiguous(self, token: SpokenToken, names: list[str]) -> NoReturn:
        letter = names[0].lower()
        spoken = LETTER_NAMES.get(letter, token.text) if len(letter) == 1 else token.text
        self.fail(
            "E-SPK-005",
            f"Hay {len(names)} símbolos que se dicen «{token.text}»: {_spanish_list(names)}. "
            f"Di «{spoken} mayúscula» o «{spoken} minúscula».",
        )

    def variable(self) -> str | None:
        token = self.peek()
        if token is None:
            return None
        if token.exact:  # las variables son minúsculas: «x mayúscula» no es variable
            name = token.names[0]
            return name if is_variable_name(name) else None
        for candidate in token.names:
            if is_variable_name(candidate.lower()):
                return candidate.lower().translate(_SUBSCRIPTS)
        return None

    def take_variable(self) -> str:
        name = self.variable()
        assert name is not None
        self.take(Role.VARIABLE, name)
        # "x 1", "x uno" o "x sub uno" → x1
        following = self.peek()
        offset = 1 if following is not None and following.norm == "sub" else 0
        number = self.peek(offset)
        if number is not None and (number.norm.isdigit() or number.norm in _NUMBERS):
            digits = number.norm if number.norm.isdigit() else _NUMBERS[number.norm]
            name = f"{name}{digits}" if name[-1:].isalpha() else name
            self.take(Role.VARIABLE, name, offset + 1)
        return name

    # ------------------------------------------------------------ gramática

    def parse(self) -> Formula:
        formula = self.parse_implication()
        if self.at(Word.RPAREN):
            self.fail("E-SPK-002", "Se cerró un paréntesis que no estaba abierto.")
        if self.peek() is not None:
            self.expected("un conectivo (y, o, implica) o el final")
        return formula

    def parse_implication(self) -> Formula:
        left = self.parse_disjunction()
        if self.at(Word.IMPLIES):
            self.keyword()
            return Implies(left, self.parse_implication())
        return left

    def parse_disjunction(self) -> Formula:
        left = self.parse_conjunction()
        while self.at(Word.OR):
            self.keyword()
            left = Or(left, self.parse_conjunction())
        return left

    def parse_conjunction(self) -> Formula:
        left = self.parse_unary()
        while self.at(Word.AND):
            self.keyword()
            left = And(left, self.parse_unary())
        return left

    def parse_unary(self) -> Formula:
        if self.at(Word.NOT):
            self.keyword()
            return Not(self.parse_unary())
        if self.at(Word.NOT_WIDE):
            self.keyword()
            return Not(self.parse_implication())
        if self.at(Word.IF):
            self.keyword()
            condition = self.parse_disjunction()
            if not self.at(Word.IMPLIES):
                self.expected("«entonces»")
            self.keyword()
            return Implies(condition, self.parse_implication())
        if self.at(Word.FORALL, Word.EXISTS):
            return self.parse_quantifier()
        return self.parse_atom()

    def parse_quantifier(self) -> Formula:
        quantifier = self.keyword()
        if self.variable() is None:
            self.expected(f"una variable después de «{quantifier.value}» (u, v, w, x, y, z)")
        variables = [self.take_variable()]
        # "para todo x coma y tal que …" o "para todo x y y, …": varias variables.
        while (
            self.at(Word.COMMA, Word.AND)
            and self._variable_at(1)
            and not self.at(Word.EQ, Word.NEQ, Word.OF, offset=2)
        ):
            self.keyword(",")
            variables.append(self.take_variable())

        if self.at(Word.SUCH_THAT, Word.COMMA):
            self.keyword("tal que")
            body = self.parse_implication()  # alcance hasta el final del grupo
        else:
            if self.at(Word.AND) and self.at(Word.FORALL, Word.EXISTS, offset=1):
                self.keyword()  # "para todo x y existe y …"
            body = self.parse_unary()

        node = ForAll if quantifier is Word.FORALL else Exists
        for var in reversed(variables):
            body = node(var, body)
        return body

    def _variable_at(self, offset: int) -> bool:
        saved = self.pos
        self.pos += offset
        try:
            return self.variable() is not None
        finally:
            self.pos = saved

    def parse_atom(self) -> Formula:
        if self.at(Word.LPAREN):
            self.keyword()
            inner = self.parse_implication()
            if not self.at(Word.RPAREN):
                self.expected("«cierra paréntesis»")
            self.keyword()
            return inner

        predicate = self.symbol({SymbolKind.PREDICATE})
        if predicate is not None:
            name, _, size = predicate
            self.take(Role.SYMBOL, name, size)
            return Pred(name, self.parse_arguments(self.signature.predicates[name]))

        left = self.parse_term(atom=True)
        if self.at(Word.EQ, Word.NEQ):
            negated = self.keyword() is Word.NEQ
            equation = Eq(left, self.parse_term())
            return Not(equation) if negated else equation
        self.expected("«es igual a» después del término (o un predicado al inicio)")

    def parse_arguments(self, arity: int) -> tuple[Term, ...]:
        parenthesized = self.at(Word.LPAREN)
        if self.at(Word.OF, Word.LPAREN):
            self.keyword()
        args = [self.parse_term()]
        while len(args) < arity:
            if self.at(Word.COMMA, Word.AND):
                self.keyword()
            args.append(self.parse_term())
        if parenthesized:
            if not self.at(Word.RPAREN):
                self.expected("«cierra paréntesis» después de los argumentos")
            self.keyword()
        return tuple(args)

    def parse_term(self, *, atom: bool = False) -> Term:
        """Un término; con `atom` se está al inicio de una fórmula atómica."""
        token = self.peek()
        if token is None:
            self.expected("un término (variable, constante o función)")
        found = self.symbol({SymbolKind.CONSTANT, SymbolKind.FUNCTION})
        if found is not None:
            name, kind, size = found
            self.take(Role.SYMBOL, name, size)
            if kind is SymbolKind.CONSTANT:
                return Const(name)
            return Func(name, self.parse_arguments(self.signature.functions[name]))
        if self.variable() is not None:
            return Var(self.take_variable())
        if token.word is not None:
            self.expected("un término (variable, constante o función)")
        predicate = self.symbol({SymbolKind.PREDICATE})
        if predicate is not None:
            self.fail(
                "E-SPK-003",
                f"«{token.text}» es el predicado {predicate[0]}; aquí se esperaba un término.",
            )
        with_arguments = self.at(Word.OF, Word.LPAREN, offset=1)
        expected: tuple[SymbolKind, ...]
        if not with_arguments:
            expected = (SymbolKind.CONSTANT,)
        elif atom:
            expected = (SymbolKind.PREDICATE, SymbolKind.FUNCTION)
        else:
            expected = (SymbolKind.FUNCTION,)
        diagnostic = Diagnostic(
            "E-SPK-001", f"No se reconoce «{token.text}».", Location("speech", token.span)
        )
        raise _UnknownWord(diagnostic, self.pos, expected)


_SUBSCRIPTS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")


def _simplify(name: str) -> str:
    return normalize(name).replace("_", "").replace(" ", "")


# ------------------------------------------------------------------ comandos


class Command(StrEnum):
    UNDO = "borrar"
    CLEAR = "vaciar"
    ACCEPT = "aceptar"
    EVALUATE = "evaluar"
    CANCEL = "cancelar"
    DECLARE = "declarar"


_COMMANDS: dict[str, Command] = {
    "borra eso": Command.UNDO,
    "borrar eso": Command.UNDO,
    "borra lo ultimo": Command.UNDO,
    "deshacer": Command.UNDO,
    "deshaz": Command.UNDO,
    "borra todo": Command.CLEAR,
    "borrar todo": Command.CLEAR,
    "empieza de nuevo": Command.CLEAR,
    "listo": Command.ACCEPT,
    "aceptar": Command.ACCEPT,
    "acepta": Command.ACCEPT,
    "evaluar": Command.EVALUATE,
    "evalua": Command.EVALUATE,
    "evalua la formula": Command.EVALUATE,
    "cancelar": Command.CANCEL,
    "cancela": Command.CANCEL,
    "declara": Command.DECLARE,
    "declarar": Command.DECLARE,
    "declaralo": Command.DECLARE,
    "declara el simbolo": Command.DECLARE,
}


def detect_command(utterance: str) -> Command | None:
    """Comando de voz si la frase completa es un comando ("borra eso", "listo", …)."""
    words = " ".join(normalize(w) for w in re.findall(r"[A-Za-zÀ-ÿ]+", utterance))
    return _COMMANDS.get(words)
