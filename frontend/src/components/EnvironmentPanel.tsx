import type { Diagnostic } from '../api/client'
import * as ops from '../lib/projectOps'
import { useProject, useUpdate } from '../store/projectStore'
import { DiagnosticList, Hint, Section } from './ui'
import { TagMap } from './diagrams'
import { SlotBoard } from './visual'

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
  const slots = freeVars.map((variable) => ({
    id: variable,
    label: variable,
    caption: `l(${variable})`,
    ariaLabel: `Valor de ${variable}`,
    value: project.environment[variable] ?? '',
    onChange: (value: string) => update((p) => ops.setEnvironmentValue(p, variable, value)),
  }))

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
            Cada variable libre es una cajita: pon dentro el elemento de 𝒟 que representa. Eso es
            el entorno <span className="formula">l : V → 𝒟</span>.
          </Hint>
          <div className="mt-3 grid items-start gap-3 md:grid-cols-[1fr_minmax(0,20rem)]">
            <SlotBoard domain={project.domain} slots={slots} />
            {project.domain.length <= 14 && (
              <TagMap domain={project.domain} tags={slots} kind="variable" />
            )}
          </div>
        </>
      )}
      <DiagnosticList diagnostics={diagnostics} />
    </Section>
  )
}
