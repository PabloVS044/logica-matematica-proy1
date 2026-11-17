import { useId, useState, type ReactNode } from 'react'

import { sfx } from '../lib/sound'

/**
 * Diagramas como los del pizarrón, y además se pueden tocar:
 * - grafo de una relación binaria (flechas entre perlas),
 * - diagrama de Venn de un predicado unario,
 * - diagrama de flechas de una función unaria,
 * - tabla de Cayley de una operación binaria,
 * - mapa de etiquetas (constantes o variables) sobre los elementos.
 */

interface Point {
  x: number
  y: number
}

const SIZE = 300
const CENTER = SIZE / 2

/** viewBox que encuadra el anillo con un margen alrededor. */
function frame(radius: number, margin: number): string {
  const half = radius + margin
  return `${CENTER - half} ${CENTER - half} ${2 * half} ${2 * half}`
}

function ring(n: number): { points: Point[]; radius: number; pearl: number } {
  const pearl = n > 9 ? 15 : 19
  const radius = n <= 1 ? 0 : Math.min(100, 40 + n * 8)
  const points = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) }
  })
  return { points, radius, pearl }
}

/** Colores de los elementos (tabla de Cayley): uno por elemento, repartidos en el círculo. */
function elementHue(index: number, total: number): string {
  return `hsl(${Math.round((index * 360) / Math.max(1, total)) + 200} 70% 72%)`
}

function PearlDefs({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-pearl`} cx="35%" cy="30%" r="75%">
        <stop offset="0%" style={{ stopColor: 'var(--surface)' }} />
        <stop offset="70%" style={{ stopColor: 'var(--sunken)' }} />
        <stop offset="100%" style={{ stopColor: 'var(--line)' }} />
      </radialGradient>
      <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.25" />
      </filter>
    </defs>
  )
}

function Pearl({
  id,
  at,
  r,
  label,
  selected = false,
  stroke,
  dashed = false,
  dim = false,
  onClick,
  title,
}: {
  id: string
  at: Point
  r: number
  label: string
  selected?: boolean
  stroke?: string
  dashed?: boolean
  dim?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <g
      role={onClick ? 'button' : undefined}
      aria-label={title}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        transform: `translate(${at.x}px, ${at.y}px)`,
        transition: 'transform 350ms cubic-bezier(.2,.8,.2,1)',
        cursor: onClick ? 'pointer' : undefined,
        opacity: dim ? 0.5 : 1,
      }}
      className="diagram-pearl"
    >
      {title && <title>{title}</title>}
      {selected && <circle r={r + 6} fill="none" stroke="var(--accent)" strokeWidth={3} opacity={0.8} />}
      <circle
        r={r}
        fill={`url(#${id}-pearl)`}
        filter={`url(#${id}-shadow)`}
        stroke={stroke ?? 'var(--line)'}
        strokeWidth={stroke ? 3 : 1.5}
        strokeDasharray={dashed ? '4 3' : undefined}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className="formula"
        fontSize={r * 0.95}
        fontWeight={600}
        fill="var(--ink)"
        style={{ pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  )
}

function Arrowhead({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  )
}

/** Flecha de a hacia b que termina en el borde de las perlas; `bend` la curva. */
function arrowPath(a: Point, b: Point, r: number, bend = 0): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const start = { x: a.x + ux * (r + 2), y: a.y + uy * (r + 2) }
  const end = { x: b.x - ux * (r + 5), y: b.y - uy * (r + 5) }
  if (!bend) return `M${start.x},${start.y} L${end.x},${end.y}`
  const control = { x: (start.x + end.x) / 2 - uy * bend, y: (start.y + end.y) / 2 + ux * bend }
  return `M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`
}

/** Lazo de un elemento consigo mismo, hacia afuera del anillo. */
function loopPath(p: Point, r: number): string {
  const angle = Math.atan2(p.y - CENTER, p.x - CENTER) || -Math.PI / 2
  const at = (a: number, d: number) => ({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d })
  const s = at(angle - 0.55, r + 2)
  const e = at(angle + 0.55, r + 5)
  const c1 = at(angle - 0.7, r + 34)
  const c2 = at(angle + 0.7, r + 34)
  return `M${s.x},${s.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${e.x},${e.y}`
}

function DiagramFrame({ hint, children }: { hint: ReactNode; children: ReactNode }) {
  return (
    <figure className="rounded-2xl border border-line bg-surface p-2 shadow-sm">
      {children}
      <figcaption className="px-1 pt-1 text-center text-xs text-muted">{hint}</figcaption>
    </figure>
  )
}

// ------------------------------------------------------------------ relación binaria

export function RelationGraph({
  name,
  color,
  domain,
  has,
  toggle,
}: {
  name: string
  color: string
  domain: readonly string[]
  has: (t: readonly string[]) => boolean
  toggle: (t: readonly string[]) => void
}) {
  const id = useId().replace(/:/g, '')
  const { points, radius, pearl } = ring(domain.length)
  const [from, setFrom] = useState<string | null>(null)
  const source = from !== null && domain.includes(from) ? from : null

  function pick(element: string) {
    if (source === null) {
      setFrom(element)
      sfx.play('seleccionar')
      return
    }
    toggle([source, element])
    setFrom(null)
  }

  const edges: { a: number; b: number }[] = []
  domain.forEach((a, i) => domain.forEach((b, j) => has([a, b]) && edges.push({ a: i, b: j })))

  return (
    <DiagramFrame
      hint={
        source !== null ? (
          <>
            Desde <b className="formula">{source}</b>: toca el destino (o {source} otra vez para un
            lazo).{' '}
            <button type="button" className="underline" onClick={() => setFrom(null)}>
              Cancelar
            </button>
          </>
        ) : (
          'Toca un elemento y luego otro para poner o quitar la flecha. Toca una flecha para quitarla.'
        )
      }
    >
      <svg viewBox={frame(radius, pearl + 38)} className="mx-auto block w-full max-w-72" role="group" aria-label={`Grafo de ${name}`}>
        <PearlDefs id={id} />
        <defs>
          <Arrowhead id={`${id}-head`} color={color} />
        </defs>
        {edges.map(({ a, b }) => {
          const d =
            a === b
              ? loopPath(points[a], pearl)
              : arrowPath(points[a], points[b], pearl, has([domain[b], domain[a]]) ? 16 : 0)
          return (
            <g
              key={`${a}-${b}`}
              onClick={() => toggle([domain[a], domain[b]])}
              style={{ cursor: 'pointer' }}
              className="diagram-edge"
            >
              <title>{`${name}(${domain[a]}, ${domain[b]}) — tocar para quitar`}</title>
              <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
              <path d={d} stroke={color} strokeWidth={2.6} fill="none" markerEnd={`url(#${id}-head)`} />
            </g>
          )
        })}
        {domain.map((element, i) => (
          <Pearl
            key={element}
            id={id}
            at={points[i]}
            r={pearl}
            label={element}
            selected={source === element}
            title={source === null ? `Flecha desde ${element}` : `Flecha de ${source} a ${element}`}
            onClick={() => pick(element)}
          />
        ))}
      </svg>
    </DiagramFrame>
  )
}

// ------------------------------------------------------------------ predicado unario

/** Reparte k puntos en una cuadrícula dentro de un rectángulo. */
function grid(k: number, box: { x: number; y: number; w: number; h: number }, step: number): Point[] {
  if (k === 0) return []
  const cols = Math.max(1, Math.min(k, Math.floor(box.w / step)))
  const rows = Math.ceil(k / cols)
  const usedW = (Math.min(k, cols) - 1) * step
  const usedH = (rows - 1) * step
  return Array.from({ length: k }, (_, i) => ({
    x: box.x + box.w / 2 - usedW / 2 + (i % cols) * step,
    y: box.y + box.h / 2 - usedH / 2 + Math.floor(i / cols) * step,
  }))
}

export function VennSet({
  name,
  color,
  domain,
  has,
  toggle,
}: {
  name: string
  color: string
  domain: readonly string[]
  has: (t: readonly string[]) => boolean
  toggle: (t: readonly string[]) => void
}) {
  const id = useId().replace(/:/g, '')
  const r = domain.length > 9 ? 15 : 18
  const step = 2 * r + 10
  const inside = domain.filter((e) => has([e]))
  const outside = domain.filter((e) => !has([e]))
  const insideAt = grid(inside.length, { x: 50, y: 50, w: 170, h: 110 }, step)
  const outsideAt = grid(outside.length, { x: 262, y: 30, w: 96, h: 150 }, step)
  const position = new Map<string, Point>()
  inside.forEach((e, i) => position.set(e, insideAt[i]))
  outside.forEach((e, i) => position.set(e, outsideAt[i]))

  return (
    <DiagramFrame hint="Toca un elemento para meterlo o sacarlo del conjunto.">
      <svg viewBox="0 0 380 210" className="mx-auto block w-full max-w-md" role="group" aria-label={`Diagrama de Venn de ${name}`}>
        <PearlDefs id={id} />
        <rect x={6} y={6} width={368} height={198} rx={18} fill="var(--sunken)" stroke="var(--line)" strokeWidth={1.5} />
        <text x={20} y={30} className="formula" fontSize={18} fill="var(--muted)">
          𝒟
        </text>
        <ellipse cx={135} cy={108} rx={112} ry={82} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2.5} />
        <text x={135} y={42} textAnchor="middle" className="formula" fontSize={17} fontWeight={700} fill={color}>
          {name}ᴵ
        </text>
        {domain.map((element) => (
          <Pearl
            key={element}
            id={id}
            at={position.get(element)!}
            r={r}
            label={element}
            stroke={has([element]) ? color : undefined}
            title={has([element]) ? `Sacar ${element} de ${name}` : `Meter ${element} en ${name}`}
            onClick={() => toggle([element])}
          />
        ))}
      </svg>
    </DiagramFrame>
  )
}

// ------------------------------------------------------------------ función unaria

export function MappingDiagram({
  name,
  domain,
  valueOf,
  set,
}: {
  name: string
  domain: readonly string[]
  valueOf: (input: string) => string
  set: (input: string, output: string) => void
}) {
  const id = useId().replace(/:/g, '')
  const [input, setInput] = useState<string | null>(null)
  const firstMissing = domain.find((e) => !domain.includes(valueOf(e))) ?? null
  const active = input !== null && domain.includes(input) ? input : firstMissing
  const r = 16
  const gap = 2 * r + 10
  const height = 46 + domain.length * gap
  const left = (i: number) => ({ x: 70, y: 50 + i * gap })
  const right = (i: number) => ({ x: 250, y: 50 + i * gap })

  function choose(output: string) {
    if (active === null) return
    set(active, output)
    sfx.play('flechaRecorre', { gain: 0.6, rate: 1.3 })
    const next = domain.find((e) => e !== active && !domain.includes(valueOf(e)))
    setInput(next ?? null)
  }

  return (
    <DiagramFrame
      hint={
        active !== null ? (
          <>
            ¿A dónde va <b className="formula">{name}({active})</b>? Toca su salida a la derecha.
          </>
        ) : (
          'Toca una entrada (izquierda) y luego su salida (derecha) para mover la flecha.'
        )
      }
    >
      <svg viewBox={`0 0 320 ${height}`} className="mx-auto block w-full max-w-80" role="group" aria-label={`Diagrama de flechas de ${name}`}>
        <PearlDefs id={id} />
        <defs>
          <Arrowhead id={`${id}-head`} color="var(--accent)" />
        </defs>
        <text x={70} y={22} textAnchor="middle" className="formula" fontSize={15} fill="var(--muted)">
          x
        </text>
        <text x={250} y={22} textAnchor="middle" className="formula" fontSize={15} fill="var(--muted)">
          {name}(x)
        </text>
        <rect x={40} y={30} width={60} height={height - 40} rx={28} fill="var(--sunken)" />
        <rect x={220} y={30} width={60} height={height - 40} rx={28} fill="var(--sunken)" />
        {domain.map((e, i) => {
          const j = domain.indexOf(valueOf(e))
          if (j < 0) return null
          return (
            <path
              key={e}
              d={arrowPath(left(i), right(j), r)}
              stroke="var(--accent)"
              strokeOpacity={active === e ? 1 : 0.7}
              strokeWidth={active === e ? 3 : 2}
              fill="none"
              markerEnd={`url(#${id}-head)`}
            />
          )
        })}
        {domain.map((e, i) => (
          <Pearl
            key={`in-${e}`}
            id={id}
            at={left(i)}
            r={r}
            label={e}
            selected={active === e}
            dashed={!domain.includes(valueOf(e))}
            stroke={!domain.includes(valueOf(e)) ? 'var(--warn)' : undefined}
            title={`Elegir la entrada ${e}`}
            onClick={() => setInput(e)}
          />
        ))}
        {domain.map((e, i) => (
          <Pearl
            key={`out-${e}`}
            id={id}
            at={right(i)}
            r={r}
            label={e}
            title={active !== null ? `${name}(${active}) = ${e}` : `Salida ${e}`}
            onClick={active !== null ? () => choose(e) : undefined}
          />
        ))}
      </svg>
    </DiagramFrame>
  )
}

// ------------------------------------------------------------------ operación binaria

export function CayleyTable({
  name,
  domain,
  valueOf,
  set,
}: {
  name: string
  domain: readonly string[]
  valueOf: (a: string, b: string) => string
  set: (a: string, b: string, value: string) => void
}) {
  function cycle(a: string, b: string, direction: 1 | -1) {
    const current = domain.indexOf(valueOf(a, b))
    const next =
      current < 0
        ? direction === 1
          ? 0
          : domain.length - 1
        : (current + direction + domain.length) % domain.length
    set(a, b, domain[next])
    sfx.play('simbolo')
  }

  return (
    <DiagramFrame hint="Tabla de Cayley: toca una casilla para pasar al siguiente valor (clic derecho, al anterior). Cada color es un elemento.">
      <div className="overflow-x-auto">
        <table className="formula mx-auto border-separate border-spacing-1 text-center">
          <caption className="sr-only">Valores de {name}: fila primer argumento, columna segundo</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 text-lg font-bold">
                {name}
              </th>
              {domain.map((b) => (
                <th key={b} scope="col" className="px-1 font-semibold text-muted">
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {domain.map((a) => (
              <tr key={a}>
                <th scope="row" className="px-2 font-semibold text-muted">
                  {a}
                </th>
                {domain.map((b) => {
                  const value = valueOf(a, b)
                  const index = domain.indexOf(value)
                  return (
                    <td key={b} className="p-0">
                      <button
                        type="button"
                        aria-label={`${name}(${a}, ${b}) = ${index >= 0 ? value : 'sin valor'}`}
                        title={`${name}(${a}, ${b})`}
                        onClick={() => cycle(a, b, 1)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          cycle(a, b, -1)
                        }}
                        className={`h-10 w-10 rounded-lg text-lg font-semibold transition hover:scale-110 ${
                          index >= 0 ? 'text-[#1b2033] shadow-sm' : 'border-2 border-dashed border-warn text-warn'
                        }`}
                        style={index >= 0 ? { background: elementHue(index, domain.length) } : undefined}
                      >
                        {index >= 0 ? value : '?'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DiagramFrame>
  )
}

// ------------------------------------------------------------------ etiquetas sobre elementos

export interface Tag {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

/**
 * Mini universo: las perlas en anillo y, colgando de cada una, las etiquetas que la nombran
 * (constantes) o que apuntan a ella (variables del entorno).
 */
export function TagMap({
  domain,
  tags,
  kind,
}: {
  domain: readonly string[]
  tags: readonly Tag[]
  kind: 'constante' | 'variable'
}) {
  const id = useId().replace(/:/g, '')
  const { points, radius, pearl } = ring(domain.length)
  const assigned = (t: Tag) => domain.includes(t.value)
  const [picked, setPicked] = useState<string | null>(null)
  const firstFree = tags.find((t) => !assigned(t))?.id ?? null
  const active = tags.some((t) => t.id === picked) ? picked : firstFree
  const current = tags.find((t) => t.id === active)

  function place(element: string) {
    if (!current) return
    current.onChange(element)
    sfx.play('variable', { gain: 0.8 })
    const next = tags.find((t) => t.id !== current.id && !assigned(t))
    setPicked(next?.id ?? null)
  }

  const pill = (label: string) => Math.max(26, label.length * 9 + 14)
  const stacks = new Map<string, number>()
  const loose = tags.filter((t) => !assigned(t))
  const deepest = Math.max(
    1,
    ...domain.map((element) => tags.filter((t) => t.value === element).length),
  )
  const margin = pearl + 30 + deepest * 24
  const top = CENTER - radius - margin

  return (
    <DiagramFrame
      hint={
        current ? (
          <>
            Toca el elemento al que {kind === 'variable' ? 'apunta' : 'nombra'}{' '}
            <b className="formula">{current.label}</b>.
          </>
        ) : (
          `Toca una etiqueta y luego un elemento para moverla.`
        )
      }
    >
      <svg
        viewBox={frame(radius, margin)}
        className="mx-auto block w-full max-w-72"
        role="group"
        aria-label={kind === 'variable' ? 'Mapa del entorno' : 'Mapa de las constantes'}
      >
        <PearlDefs id={id} />
        <circle cx={CENTER} cy={CENTER} r={radius} fill="none" stroke="var(--line)" strokeDasharray="3 5" />
        {domain.map((element, i) => (
          <Pearl
            key={element}
            id={id}
            at={points[i]}
            r={pearl}
            label={element}
            title={current ? `${current.label} ↦ ${element}` : `Elemento ${element}`}
            onClick={current ? () => place(element) : undefined}
          />
        ))}
        {tags.map((tag, k) => {
          const width = pill(tag.label)
          let at: Point
          let anchor: Point | null = null
          if (assigned(tag)) {
            const i = domain.indexOf(tag.value)
            const level = stacks.get(tag.value) ?? 0
            stacks.set(tag.value, level + 1)
            const p = points[i]
            const angle = domain.length > 1 ? Math.atan2(p.y - CENTER, p.x - CENTER) : -Math.PI / 2
            const distance = pearl + 26 + level * 24
            at = { x: p.x + Math.cos(angle) * distance, y: p.y + Math.sin(angle) * distance }
            anchor = { x: p.x + Math.cos(angle) * pearl, y: p.y + Math.sin(angle) * pearl }
          } else {
            const index = loose.indexOf(tag)
            at = { x: top + 14 + width / 2 + index * (width + 8), y: top + 14 }
          }
          const selected = tag.id === active
          return (
            <g
              key={tag.id}
              role="button"
              tabIndex={0}
              aria-label={`${kind === 'variable' ? 'Variable' : 'Constante'} ${tag.label}${assigned(tag) ? ` en ${tag.value}` : ', sin asignar'}`}
              aria-pressed={selected}
              onClick={() => setPicked(tag.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPicked(tag.id)
                }
              }}
              style={{ cursor: 'pointer' }}
              data-index={k}
            >
              {anchor && (
                <line x1={anchor.x} y1={anchor.y} x2={at.x} y2={at.y} stroke="var(--accent)" strokeWidth={1.5} />
              )}
              <g style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: 'transform 350ms cubic-bezier(.2,.8,.2,1)' }}>
                <rect
                  x={-width / 2}
                  y={-11}
                  width={width}
                  height={22}
                  rx={11}
                  fill={selected ? 'var(--accent)' : assigned(tag) ? 'var(--accent-soft)' : 'var(--warn-soft)'}
                  stroke={assigned(tag) ? 'var(--accent)' : 'var(--warn)'}
                  strokeDasharray={assigned(tag) ? undefined : '3 3'}
                  strokeWidth={1.5}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="formula"
                  fontSize={14}
                  fontWeight={700}
                  fill={selected ? 'var(--surface)' : 'var(--ink)'}
                  style={{ pointerEvents: 'none' }}
                >
                  {tag.label}
                </text>
              </g>
            </g>
          )
        })}
      </svg>
    </DiagramFrame>
  )
}
