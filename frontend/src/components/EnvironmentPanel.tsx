import type { Diagnostic } from '../api/client'
import * as ops from '../lib/projectOps'
import { useProject, useUpdate } from '../store/projectStore'
import { DiagnosticList, Hint, inputClass, Section } from './ui'

export function EnvironmentPanel({
  freeVars,
  formulaState,
  diagnostics,
}: {
  freeVars: readonly string[]
  /** "empty": sin fórmula; "invalid": con error de sintaxis; "ready": analizada. */
  formulaState: 'empty' | 'invalid' | 'ready'
  diagnostics: readonly Diagnostic[]
}) {
  const project = useProject()
  const update = useUpdate()

  return (
    <Section title="Entorno">
      {formulaState === 'empty' ? (
        <Hint>Escribe una fórmula para saber qué variables libres hay que asignar.</Hint>
      ) : formulaState === 'invalid' ? (
        <Hint>Corrige la sintaxis de la fórmula para conocer sus variables libres.</Hint>
      ) : freeVars.length === 0 ? (
        <Hint>
          La fórmula no tiene variables libres, así que su valor no depende del entorno.
        </Hint>
      ) : project.domain.length === 0 ? (
        <Hint>Agrega elementos al dominio para asignar las variables libres.</Hint>
      ) : (
        <>
          <Hint>
            Asigna a cada variable libre un elemento de 𝒟: el entorno{' '}
            <span className="formula">l : V → 𝒟</span>.
          </Hint>
          <div className="mt-2 flex flex-wrap gap-4">
            {freeVars.map((variable) => {
              const value = project.environment[variable] ?? ''
              const invalid = value !== '' && !project.domain.includes(value)
              return (
                <label key={variable} className="formula flex items-center gap-1.5 text-lg">
                  l({variable}) =
                  <select
                    aria-label={`Valor de ${variable}`}
                    value={invalid ? '' : value}
                    onChange={(e) =>
                      update((p) => ops.setEnvironmentValue(p, variable, e.target.value))
                    }
                    className={`${inputClass} ${value === '' || invalid ? 'border-false' : ''}`}
                  >
                    <option value="">—</option>
                    {project.domain.map((element) => (
                      <option key={element} value={element}>
                        {element}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        </>
      )}
      <DiagnosticList diagnostics={diagnostics} />
    </Section>
  )
}
