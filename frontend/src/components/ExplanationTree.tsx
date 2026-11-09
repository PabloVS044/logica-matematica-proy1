import { useState } from 'react'

import type { ExplainNode } from '../api/client'
import { Notation } from '../lib/notation'

function TruthMark({ value }: { value: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm font-bold ${
        value ? 'bg-true-soft text-true' : 'bg-false-soft text-false'
      }`}
      title={value ? 'Verdadera' : 'Falsa'}
    >
      {value ? 'V' : 'F'}
      <span className="sr-only">{value ? ' (verdadera)' : ' (falsa)'}</span>
    </span>
  )
}

const JUSTIFICATION_STYLE: Record<string, string> = {
  testigo: 'text-true',
  contraejemplo: 'text-false',
  'comprobación completa': 'text-accent',
}

export function ExplanationTree({ root }: { root: ExplainNode }) {
  const [onlyDecisive, setOnlyDecisive] = useState(false)
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={onlyDecisive}
          onChange={(e) => setOnlyDecisive(e.target.checked)}
        />
        Mostrar solo las razones decisivas
      </label>
      <ul className="space-y-1">
        <TreeNode node={root} onPath onlyDecisive={onlyDecisive} openByDefault />
      </ul>
    </div>
  )
}

function TreeNode({
  node,
  onPath,
  onlyDecisive,
  openByDefault,
}: {
  node: ExplainNode
  onPath: boolean
  onlyDecisive: boolean
  openByDefault: boolean
}) {
  const [open, setOpen] = useState(openByDefault)
  const children = node.children.filter((c) => !onlyDecisive || c.decisive)
  const expandable = children.length > 0
  const isFullCheck = node.justification === 'comprobación completa'

  return (
    <li className={node.decisive ? '' : 'opacity-55'}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={!expandable}
          aria-expanded={expandable ? open : undefined}
          aria-label={open ? 'Contraer' : 'Expandir'}
          className="mt-0.5 w-5 shrink-0 text-muted disabled:invisible"
        >
          {open ? '▾' : '▸'}
        </button>
        <TruthMark value={node.value} />
        <div className="min-w-0 flex-1">
          <p className="formula text-lg leading-snug">
            {node.binding && (
              <span className="mr-2 text-muted">
                {node.binding.var} ↦ {node.binding.value}
              </span>
            )}
            {node.formula}
          </p>
          <p className="text-sm">
            {node.justification && (
              <span className={`mr-1 font-bold ${JUSTIFICATION_STYLE[node.justification] ?? ''}`}>
                {node.justification[0].toUpperCase() + node.justification.slice(1)}.
              </span>
            )}
            <span className="formula text-[0.95rem]">
              <Notation
                text={node.justification ? node.reason.replace(/^[^:.]+[:.]\s*/, '') : node.reason}
              />
            </span>
          </p>
          {node.computations.length > 0 && (
            <ul className="formula mt-0.5 text-sm text-muted">
              {node.computations.map((step) => (
                <li key={step}>
                  <Notation text={step} />
                </li>
              ))}
            </ul>
          )}
          {node.pruned && (
            <p className="text-sm text-warn">Detalle omitido por el tamaño de la explicación.</p>
          )}
        </div>
      </div>
      {open && expandable && (
        <ul className="mt-1 ml-[0.6rem] space-y-1 border-l border-line pl-4">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onPath={onPath && child.decisive}
              onlyDecisive={onlyDecisive}
              openByDefault={onPath && child.decisive && !isFullCheck}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
