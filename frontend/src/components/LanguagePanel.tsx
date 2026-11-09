import { useState, type FormEvent } from 'react'

import type { Diagnostic } from '../api/client'
import type { SymbolDecl } from '../lib/project'
import * as ops from '../lib/projectOps'
import { useProject, useUpdate } from '../store/projectStore'
import { ChipInput } from './ChipInput'
import { Button, DiagnosticList, Hint, inputClass, RemoveButton, Section } from './ui'

const CATEGORY_LABEL = {
  constants: 'constante',
  functions: 'símbolo funcional',
  predicates: 'predicado',
} as const

/** Diagnósticos del lenguaje cuya ruta es [categoría, índice]. */
function forCategory(diagnostics: readonly Diagnostic[], category: string) {
  return diagnostics.filter((d) => d.location.path?.[0] === category)
}

export function LanguagePanel({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  const project = useProject()
  const update = useUpdate()

  return (
    <Section title="Lenguaje">
      <Hint>
        Declara los símbolos no lógicos. Las variables (u, v, w, x, y, z, con dígitos opcionales) y
        los símbolos lógicos ¬ ∧ ∨ → ∀ ∃ = no se declaran.
      </Hint>

      <div className="mt-4 space-y-4">
        <div>
          <h3 className="mb-1.5 font-bold">Constantes</h3>
          <ChipInput
            items={project.constants}
            label="Nueva constante"
            placeholder="p. ej. c, zero"
            onAdd={(name) => update((p) => ops.addConstant(p, name))}
            onRemove={(index) => update((p) => ops.removeConstant(p, index))}
          />
          <DiagnosticList diagnostics={forCategory(diagnostics, CATEGORY_LABEL.constants)} />
        </div>

        <SymbolList
          title="Símbolos funcionales"
          kind="functions"
          placeholder="f"
          declarations={project.functions}
          diagnostics={forCategory(diagnostics, CATEGORY_LABEL.functions)}
        />
        <SymbolList
          title="Predicados"
          kind="predicates"
          placeholder="P"
          declarations={project.predicates}
          diagnostics={forCategory(diagnostics, CATEGORY_LABEL.predicates)}
        />
      </div>
    </Section>
  )
}

function SymbolList({
  title,
  kind,
  placeholder,
  declarations,
  diagnostics,
}: {
  title: string
  kind: ops.SymbolKind
  placeholder: string
  declarations: readonly SymbolDecl[]
  diagnostics: readonly Diagnostic[]
}) {
  const update = useUpdate()
  const [name, setName] = useState('')
  const [arity, setArity] = useState(1)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    update((p) => ops.addSymbol(p, kind, { name: name.trim(), arity }))
    setName('')
  }

  return (
    <div>
      <h3 className="mb-1.5 font-bold">{title}</h3>
      {declarations.length > 0 && (
        <ul className="mb-2 space-y-1">
          {declarations.map((decl, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                aria-label={`Nombre del ${CATEGORY_LABEL[kind]} ${index + 1}`}
                value={decl.name}
                onChange={(e) =>
                  update((p) => ops.updateSymbol(p, kind, index, { ...decl, name: e.target.value }))
                }
                className={`${inputClass} formula w-28`}
              />
              <label className="flex items-center gap-1 text-sm text-muted">
                aridad
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={decl.arity}
                  onChange={(e) =>
                    update((p) =>
                      ops.updateSymbol(p, kind, index, { ...decl, arity: Number(e.target.value) }),
                    )
                  }
                  className={`${inputClass} w-16`}
                />
              </label>
              <RemoveButton
                label={`Quitar ${decl.name}`}
                onClick={() => update((p) => ops.removeSymbol(p, kind, index))}
              />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          aria-label={`Nombre del nuevo ${CATEGORY_LABEL[kind]}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`nombre, p. ej. ${placeholder}`}
          className={`${inputClass} w-40 text-sm`}
        />
        <label className="flex items-center gap-1 text-sm text-muted">
          aridad
          <input
            type="number"
            min={1}
            max={6}
            value={arity}
            onChange={(e) => setArity(Number(e.target.value))}
            className={`${inputClass} w-16`}
          />
        </label>
        <Button type="submit">Agregar</Button>
      </form>
      <DiagnosticList diagnostics={diagnostics} />
    </div>
  )
}
