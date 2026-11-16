import type { Diagnostic, Evaluation } from '../api/client'
import { Notation } from '../lib/notation'
import { ExplanationTree } from './ExplanationTree'
import { Button, DiagnosticList, Hint, Section } from './ui'

export function ResultPanel({
  evaluation,
  error,
  pending,
  stale,
  onEvaluate,
}: {
  evaluation: Evaluation | null
  error: string | null
  pending: boolean
  stale: boolean
  /** Sin él no se muestra el botón (en el panel lateral se evalúa desde el dock). */
  onEvaluate?: () => void
}) {
  const errors: Diagnostic[] = evaluation?.diagnostics.filter((d) => d.severity === 'error') ?? []
  const warnings: Diagnostic[] =
    evaluation?.diagnostics.filter((d) => d.severity === 'warning') ?? []

  return (
    <Section
      title="Resultado"
      aside={
        onEvaluate && (
          <Button variant="primary" onClick={onEvaluate} disabled={pending}>
            {pending ? 'Evaluando…' : 'Evaluar'}
          </Button>
        )
      }
    >
      {error && <p className="text-false">{error}</p>}
      {!evaluation && !error && (
        <Hint>
          Completa el lenguaje, la interpretación y la fórmula, y presiona Evaluar para ver si ℐ la
          satisface y por qué.
        </Hint>
      )}

      {evaluation && stale && (
        <p className="mb-3 rounded-md bg-warn-soft px-3 py-1.5 text-sm text-warn">
          Cambiaste la entrada después de evaluar. Presiona Evaluar para actualizar el resultado.
        </p>
      )}

      {evaluation && !evaluation.ok && (
        <div>
          <p className="font-bold text-false">
            No se puede evaluar: {errors.length === 1 ? 'hay 1 error' : `hay ${errors.length} errores`}{' '}
            en la entrada. Una entrada inválida no recibe valor de verdad.
          </p>
          <DiagnosticList diagnostics={evaluation.diagnostics} />
        </div>
      )}

      {evaluation?.ok && evaluation.explanation && (
        <div className={stale ? 'opacity-60' : ''}>
          <Verdict evaluation={evaluation} />
          {evaluation.summary && (
            <p className="formula mt-3 text-[1.05rem] leading-relaxed">
              <Notation text={evaluation.summary.replace(/^(Verdadero|Falso)\.\s*/, '')} />
            </p>
          )}
          <DiagnosticList diagnostics={warnings} />
          {evaluation.truncated && (
            <p className="mt-2 text-sm text-warn">
              La explicación es muy grande y se muestra de forma parcial; el valor de verdad es
              exacto.
            </p>
          )}
          <h3 className="mt-5 mb-2 font-bold">Justificación</h3>
          <ExplanationTree key={evaluation.explanation.id + evaluation.summary} root={evaluation.explanation} />
        </div>
      )}
    </Section>
  )
}

function Verdict({ evaluation }: { evaluation: Evaluation }) {
  const value = evaluation.value === true
  const root = evaluation.explanation!
  const environment = root.env.map((b) => `${b.var} ↦ ${b.value}`).join(', ')
  return (
    <div
      className={`rounded-lg border-l-8 px-5 py-4 ${
        value ? 'border-true bg-true-soft' : 'border-false bg-false-soft'
      }`}
      role="status"
    >
      <p className={`text-3xl font-bold ${value ? 'text-true' : 'text-false'}`}>
        {value ? 'Verdadero' : 'Falso'}
      </p>
      <p className="formula mt-1 text-2xl break-words text-ink">
        ℐ {value ? '⊨' : '⊭'}
        {environment && <sub className="text-[0.6em]">l</sub>} {root.formula}
      </p>
      {environment && (
        <p className="formula mt-1 text-muted">
          con l: {environment}
        </p>
      )}
    </div>
  )
}
