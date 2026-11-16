import type { ExplainNode } from '../api/client'
import type { Step } from './universe'

/**
 * Cuenta cada paso de la evaluación en lenguaje sencillo, como lo explicaría una persona.
 * La notación formal sigue disponible en `node.reason`.
 */
export interface Narration {
  /** Lo que se hace en este paso; incluye la respuesta cuando ya se conoce. */
  title: string
  /** Por qué, o qué regla se aplica. */
  detail: string | null
  /** Valor de la subfórmula si este paso lo decide; null mientras se evalúa. */
  value: boolean | null
}

/** Cómo se dibuja cada predicado en la escena (para decir "flecha" o "anillo"). */
export interface PredicateShapes {
  unary: ReadonlySet<string>
  binary: ReadonlySet<string>
}

const yesNo = (value: boolean) => (value ? 'Sí' : 'No')
const truth = (value: boolean) => (value ? 'verdadera' : 'falsa')

/** Nombre hablado de una variable: "y" se lee «i griega» para no confundirla con «y». */
const VARIABLE_NAMES: Record<string, string> = {
  u: 'u',
  v: 'uve',
  w: 'doble ve',
  x: 'equis',
  y: 'i griega',
  z: 'zeta',
}
export function spokenVariable(name: string): string {
  const spoken = VARIABLE_NAMES[name[0]]
  return spoken ? `${spoken}${name.length > 1 ? ` ${name.slice(1)}` : ''}` : name
}

/** "x = a" escrito; «equis vale a» hablado. */
function binding(variable: string | undefined, value: string | undefined, voice: boolean): string {
  return voice ? `${spokenVariable(variable ?? '')} vale ${value}` : `${variable} = ${value}`
}

/** Cómo se escribe una subfórmula: con símbolos, o en español para leerla en voz alta. */
type Text = (node: ExplainNode) => string
const written: Text = (node) => node.formula
const spoken: Text = (node) => node.spoken || node.formula

/** Cuerpo de un cuantificador o de una negación: el texto de su único hijo. */
function body(node: ExplainNode, t: Text): string {
  const child = node.children[0]
  return child ? t(child) : node.formula.replace(/^(¬|[∀∃]\s*\w+)\s*/, '')
}

function atomQuestion(node: ExplainNode, shapes: PredicateShapes): string {
  const { symbol, args } = node.atom!
  if (symbol === '=') {
    return args[0] === args[1]
      ? `¿${args[0]} y ${args[1]} son el mismo elemento? Sí, son iguales.`
      : `¿${args[0]} y ${args[1]} son el mismo elemento? No, son distintos.`
  }
  if (args.length === 1) {
    const ring = shapes.unary.has(symbol) ? ` (¿tiene el anillo ${symbol}?)` : ''
    return `¿${args[0]} cumple ${symbol}?${ring} ${yesNo(node.value)}.`
  }
  if (args.length === 2 && shapes.binary.has(symbol)) {
    return `¿Hay una flecha ${symbol} de ${args[0]} a ${args[1]}? ${yesNo(node.value)}.`
  }
  return `¿(${args.join(', ')}) está en ${symbol}? ${yesNo(node.value)}.`
}

/** Términos calculados con funciones, p. ej. "s(1) = 2" (no las variables sueltas). */
function functionSteps(node: ExplainNode): string[] {
  return node.computations
    .filter((c) => /ᴵ\(/.test(c))
    .map((c) => {
      // "⟦s(x)⟧_{l} = sᴵ(1) = 2" → "s(1) = 2"
      const parts = c.split(' = ')
      return parts.slice(-2).join(' = ').replace(/ᴵ/g, '')
    })
}

function visit(node: ExplainNode, shapes: PredicateShapes, t: Text): Narration {
  if (node.atom) {
    const computed = functionSteps(node)
    return {
      title: atomQuestion(node, shapes),
      detail:
        (computed.length ? `Primero se calculan los términos: ${computed.join(', ')}. ` : '') +
        `Así que ${t(node)} es ${truth(node.value)}.`,
      value: node.value,
    }
  }
  switch (node.rule) {
    case 'universal':
      return {
        title: `¿Todos los elementos cumplen ${body(node, t)}?`,
        detail: 'Para que sea verdadera, TODOS deben cumplir. Se revisan uno por uno.',
        value: null,
      }
    case 'existencial':
      return {
        title: `¿Algún elemento cumple ${body(node, t)}?`,
        detail: 'Basta con encontrar UNO que cumpla (un testigo).',
        value: null,
      }
    case 'negación':
      return {
        title: `${t(node)} significa «no ${body(node, t)}».`,
        detail: `Primero vemos si ${body(node, t)} es verdadera; el resultado se invierte.`,
        value: null,
      }
    case 'conjunción':
      return {
        title: `${t(node)}: las dos partes deben ser verdaderas.`,
        detail: 'Si la primera es falsa, ya no hace falta mirar la segunda.',
        value: null,
      }
    case 'disyunción':
      return {
        title: `${t(node)}: basta con que una parte sea verdadera.`,
        detail: 'Si la primera es verdadera, ya no hace falta mirar la segunda.',
        value: null,
      }
    case 'implicación':
      return {
        title: `${t(node)}: «si … entonces …».`,
        detail: 'Solo es falsa cuando la condición es verdadera y la conclusión falsa.',
        value: null,
      }
    default:
      return { title: t(node), detail: null, value: null }
  }
}

function conclude(node: ExplainNode, step: Step, t: Text): Narration {
  const voice = t === spoken
  const [left, right] = node.children
  const value = node.value
  const result = `${t(node)} es ${value ? 'VERDADERA' : 'FALSA'}.`
  const count = node.children.filter((c) => c.binding).length
  switch (node.rule) {
    case 'universal':
      return value
        ? {
            title: `Los ${count} elementos cumplen.`,
            detail: `Comprobación completa: ${result}`,
            value,
          }
        : {
            title: `${binding(step.focus?.var, step.focus?.value, voice)} no cumple: es un contraejemplo.`,
            detail: `Con un solo elemento que falle basta: ${result}`,
            value,
          }
    case 'existencial':
      return value
        ? {
            title: `${binding(step.focus?.var, step.focus?.value, voice)} cumple: es un testigo.`,
            detail: `Con uno basta: ${result}`,
            value,
          }
        : {
            title: `Ninguno de los ${count} elementos cumple.`,
            detail: `Comprobación completa: ${result}`,
            value,
          }
    case 'negación':
      return {
        title: `${t(left)} es ${truth(left.value)}, así que su negación es ${truth(value)}.`,
        detail: result,
        value,
      }
    case 'conjunción':
      return {
        title: value
          ? 'Las dos partes son verdaderas.'
          : `${t(!left.value ? left : right)} es falsa.`,
        detail: value ? result : `Basta una parte falsa: ${result}`,
        value,
      }
    case 'disyunción':
      return {
        title: value
          ? `${t(left.value ? left : right)} es verdadera.`
          : 'Las dos partes son falsas.',
        detail: value ? `Basta una parte verdadera: ${result}` : result,
        value,
      }
    case 'implicación':
      return {
        title: !left.value
          ? `La condición ${t(left)} es falsa: no hay nada que cumplir.`
          : right.value
            ? `La condición se cumple y la conclusión ${t(right)} también.`
            : `La condición ${t(left)} se cumple, pero ${t(right)} no.`,
        detail: result,
        value,
      }
    default:
      return { title: result, detail: null, value }
  }
}

/**
 * Narración de un paso. Con `voice` las fórmulas van en español ("para todo equis …")
 * para que un sintetizador de voz pueda leerlas.
 */
export function narrate(
  step: Step,
  shapes: PredicateShapes,
  { voice = false }: { voice?: boolean } = {},
): Narration {
  const { node } = step
  const t = voice ? spoken : written
  const narration = step.phase === 'visit' ? visit(node, shapes, t) : conclude(node, step, t)
  // Al entrar a un caso de un cuantificador se dice qué elemento se prueba.
  if (step.phase === 'visit' && node.binding) {
    return { ...narration, title: `Probamos ${binding(node.binding.var, node.binding.value, voice)}. ${narration.title}` }
  }
  if (step.phase === 'conclude' && step.depth === 0) {
    return { ...narration, detail: `Resultado final. ${narration.detail ?? ''}`.trim() }
  }
  return narration
}
