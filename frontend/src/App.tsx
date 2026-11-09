import { useState } from 'react'

import { api, ApiError, type Evaluation } from './api/client'
import { EnvironmentPanel } from './components/EnvironmentPanel'
import { FormulaEditor } from './components/FormulaEditor'
import { Header } from './components/Header'
import { InterpretationPanel } from './components/InterpretationPanel'
import { LanguagePanel } from './components/LanguagePanel'
import { ResultPanel } from './components/ResultPanel'
import { toInterpretation, toLanguage, toProjectIn } from './lib/project'
import { useLiveRequest } from './lib/useLiveRequest'
import { useTheme } from './lib/useTheme'
import { useProject, useProjectStore } from './store/projectStore'

export default function App() {
  const project = useProject()
  const update = useProjectStore((s) => s.update)
  const [theme, toggleTheme] = useTheme()
  const [message, setMessage] = useState<string | null>(null)

  const language = toLanguage(project)
  const languageCheck = useLiveRequest(language, api.validateLanguage)
  const interpretationCheck = useLiveRequest(
    { language, interpretation: toInterpretation(project) },
    (input, signal) => api.validateInterpretation(input.language, input.interpretation, signal),
  )
  const hasFormula = project.formula.trim() !== ''
  const analysis = useLiveRequest(
    { language, formula: project.formula },
    (input, signal) => api.analyzeFormula(input.language, input.formula, signal),
    300,
    hasFormula,
  )
  const analysisData = hasFormula ? analysis.data : null
  const freeVars = analysisData?.free_vars ?? []

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [evaluatedKey, setEvaluatedKey] = useState<string | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const request = toProjectIn(project, freeVars)
  const currentKey = JSON.stringify(request)

  async function evaluate() {
    setPending(true)
    setEvaluationError(null)
    try {
      setEvaluation(await api.evaluate(request))
      setEvaluatedKey(currentKey)
    } catch (error) {
      setEvaluationError(error instanceof ApiError ? error.message : 'Error inesperado al evaluar.')
    } finally {
      setPending(false)
    }
  }

  const stale = evaluation !== null && evaluatedKey !== currentKey
  const environmentDiagnostics =
    evaluation && !stale
      ? evaluation.diagnostics.filter((d) => d.location.kind === 'environment')
      : []

  return (
    <div className="min-h-screen">
      <Header theme={theme} onToggleTheme={toggleTheme} onMessage={setMessage} />
      {message && (
        <div role="status" className="border-b border-line bg-accent-soft">
          <div className="mx-auto flex max-w-[1500px] items-start justify-between gap-4 px-6 py-2 text-sm">
            <p>{message}</p>
            <button type="button" onClick={() => setMessage(null)} className="text-muted">
              Cerrar
            </button>
          </div>
        </div>
      )}
      {languageCheck.error && (
        <p className="mx-auto max-w-[1500px] px-6 pt-3 text-false">{languageCheck.error}</p>
      )}
      <main className="mx-auto grid max-w-[1500px] gap-x-10 px-6 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0">
          <LanguagePanel diagnostics={languageCheck.data?.diagnostics ?? []} />
          <InterpretationPanel
            diagnostics={
              languageCheck.data?.ok === false ? [] : (interpretationCheck.data?.diagnostics ?? [])
            }
          />
        </div>
        <div className="min-w-0 border-line lg:border-l lg:pl-10">
          <FormulaEditor
            value={project.formula}
            onChange={(formula) => update((p) => ({ ...p, formula }))}
            analysis={analysisData}
            analysisError={hasFormula ? analysis.error : null}
            onSubmit={evaluate}
          />
          <EnvironmentPanel
            freeVars={freeVars}
            formulaState={!hasFormula ? 'empty' : analysisData?.syntax_tree ? 'ready' : 'invalid'}
            diagnostics={environmentDiagnostics}
          />
          <ResultPanel
            evaluation={evaluation}
            error={evaluationError}
            pending={pending}
            stale={stale}
            onEvaluate={evaluate}
          />
        </div>
      </main>
    </div>
  )
}
