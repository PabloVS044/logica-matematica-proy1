import { useEffect, useMemo, useState } from 'react'

import { api, ApiError, type Diagnostic, type Evaluation, type Example } from './api/client'
import { EnvironmentPanel } from './components/EnvironmentPanel'
import { FormulaEditor } from './components/FormulaEditor'
import { HintikkaGame } from './components/HintikkaGame'
import { Header, StatusDot } from './components/Header'
import { InterpretationPanel } from './components/InterpretationPanel'
import { LanguagePanel } from './components/LanguagePanel'
import { ResultPanel } from './components/ResultPanel'
import { floating, Modal } from './components/ui'
import {
  ElementCard,
  Legend,
  MachineLegend,
  MachineStage,
  PlaybackControls,
  StoryCard,
  UniverseStage,
  ViewToggle,
  type View,
} from './components/Universe'
import { CONFIG_TABS, type ConfigStatus, type ConfigTab } from './lib/config'
import { narrate } from './lib/narration'
import { buildMachine, machineState } from './lib/machine'
import { fromProjectIn, toInterpretation, toLanguage, toProjectIn } from './lib/project'
import * as ops from './lib/projectOps'
import { MAX_DRAWN_ELEMENTS, quantifierProgress } from './lib/universe'
import { sfx } from './lib/sound'
import { useExamples } from './lib/useExamples'
import { useLiveRequest } from './lib/useLiveRequest'
import { useSoundCues } from './lib/useSoundCues'
import { useSpeaker, type Speaker } from './lib/useSpeaker'
import { useTheme } from './lib/useTheme'
import {
  hasWebGL,
  usePlayer,
  useReducedMotion,
  useUniverseLayers,
} from './lib/useUniverse'
import { useProject, useProjectStore } from './store/projectStore'
import { useVoiceSettings } from './store/voiceStore'

const hasErrors = (diagnostics: readonly Diagnostic[] | undefined) =>
  (diagnostics ?? []).some((d) => d.severity === 'error')

export default function App() {
  const project = useProject()
  const update = useProjectStore((s) => s.update)
  const load = useProjectStore((s) => s.load)
  const [theme, toggleTheme] = useTheme()
  const [message, setMessage] = useState<string | null>(null)
  const examples = useExamples()
  const reducedMotion = useReducedMotion()
  const [webgl] = useState(hasWebGL)
  const speaker = useSpeaker()
  const voiceSettings = useVoiceSettings()

  // ---------------------------------------------------------------- validación en vivo
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

  // ---------------------------------------------------------------- evaluación
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
      const result = await api.evaluate(request)
      setEvaluation(result)
      setEvaluatedKey(currentKey)
      if (!result.ok) sfx.play('noEvaluable')
      // Con la narración activa el veredicto se dice al final de la animación.
      if (result.ok && voiceSettings.readVerdict && !voiceSettings.narrate) {
        void speaker.speak(result.spoken_summary ?? '')
      }
    } catch (error) {
      sfx.play('noEvaluable')
      setEvaluationError(error instanceof ApiError ? error.message : 'Error inesperado al evaluar.')
    } finally {
      setPending(false)
    }
  }

  // Evaluar justo después de dictar: se espera a que el análisis de la fórmula nueva
  // termine, porque de él salen las variables libres que se envían en el entorno.
  const [evaluateRequested, setEvaluateRequested] = useState(false)
  useEffect(() => {
    if (evaluateRequested && !analysis.pending) {
      setEvaluateRequested(false)
      void evaluate()
    }
    // evaluate usa el proyecto de este render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluateRequested, analysis.pending, currentKey])

  // Un aviso discreto cuando la fórmula escrita deja de ser válida.
  const formulaInvalid = hasFormula && hasErrors(analysisData?.diagnostics)
  useEffect(() => {
    if (formulaInvalid) sfx.play('errorSintaxis')
  }, [formulaInvalid])

  const stale = evaluation !== null && evaluatedKey !== currentKey
  const environmentDiagnostics =
    evaluation && !stale
      ? evaluation.diagnostics.filter((d) => d.location.kind === 'environment')
      : []

  // ---------------------------------------------------------------- ventanas
  const [configTab, setConfigTab] = useState<ConfigTab | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showGame, setShowGame] = useState(false)

  const languageInvalid = languageCheck.data?.ok === false
  const unassigned = freeVars.filter((v) => !project.domain.includes(project.environment[v] ?? ''))
  const status: ConfigStatus = {
    lenguaje: hasErrors(languageCheck.data?.diagnostics) ? 'error' : 'ok',
    interpretacion:
      !languageInvalid && hasErrors(interpretationCheck.data?.diagnostics)
        ? 'error'
        : project.domain.length === 0
          ? 'pending'
          : 'ok',
    entorno: hasErrors(environmentDiagnostics)
      ? 'error'
      : unassigned.length > 0
        ? 'pending'
        : 'ok',
  }

  function loadExample(example: Example) {
    load(fromProjectIn(example.project))
    sfx.play('ejemplo')
    setMessage(`Se cargó el ejemplo "${example.title}". ${example.description}`)
  }

  // Los avisos se ocultan solos después de un rato.
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 12_000)
    return () => clearTimeout(timer)
  }, [message])

  // ---------------------------------------------------------------- universo
  const layers = useUniverseLayers(project)
  const root = evaluation?.ok && !stale ? (evaluation.explanation ?? null) : null
  const narrating = voiceSettings.narrate && speaker.supported
  const player = usePlayer(root, evaluation?.summary ?? '', !reducedMotion, {
    narrating,
    speaking: speaker.speaking,
  })
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked !== null && project.domain.includes(picked) ? picked : null
  const [spin, setSpin] = useState(true)
  const drawable = project.domain.length > 0 && project.domain.length <= MAX_DRAWN_ELEMENTS && webgl

  // Marcador de cuantificadores del paso actual; el más interno pone ✓ / ✗ en la escena.
  const progress = player.timeline ? quantifierProgress(player.timeline, player.index) : []
  const innermost = progress.at(-1)
  const marks = new Map<string, { var: string; ok: boolean }>()
  for (const item of innermost?.items ?? []) {
    if (item.status === 'cumple' || item.status === 'falla') {
      marks.set(item.value, { var: innermost!.var, ok: item.status === 'cumple' })
    }
  }
  const shapes = useMemo(
    () => ({
      unary: new Set(layers.unary.map((l) => l.name)),
      binary: new Set(layers.binary.map((l) => l.name)),
    }),
    [layers],
  )
  // Narración en voz alta: cada paso se lee al mostrarse; al final, el veredicto.
  const spokenStep = player.step && narrating ? narrate(player.step, shapes, { voice: true }) : null
  const spokenText = spokenStep ? [spokenStep.title, spokenStep.detail].filter(Boolean).join(' ') : ''
  const lastStep = player.timeline ? player.index === player.timeline.steps.length - 1 : false
  useEffect(() => {
    if (!spokenText) return
    const verdict = lastStep && voiceSettings.readVerdict ? ` ${evaluation?.spoken_summary ?? ''}` : ''
    void speaker.speak(spokenText + verdict)
    // solo cuando cambia el paso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenText, player.index])
  useEffect(() => {
    if (!narrating) speaker.stop()
  }, [narrating, speaker])

  const story = (
    <StoryCard player={player} progress={progress} formula={project.formula} shapes={shapes} />
  )

  // ---------------------------------------------------------------- máquina
  // Abre en la máquina; si todavía no hay una fórmula válida, se muestra el universo.
  const [view, setView] = useState<View>('maquina')
  const syntaxTree = analysisData?.syntax_tree ?? null
  const machine = useMemo(() => (syntaxTree ? buildMachine(syntaxTree) : null), [syntaxTree])
  const machineReady = machine !== null && webgl
  const shownView: View = machineReady ? view : 'universo'
  const showMachine = shownView === 'maquina' && machine !== null
  useSoundCues(player, shownView, shapes.binary)
  function changeView(next: View) {
    if (next !== shownView) sfx.play('cambiarVista')
    setView(next)
  }
  function select(element: string | null) {
    if (element !== null) sfx.play('seleccionar')
    setPicked(element)
  }
  const machineNow =
    machine && player.timeline ? machineState(machine, player.timeline, player.index) : null
  // En pantallas anchas la escena queda entre la leyenda y la narración.
  // (en la máquina la leyenda se pliega y la escena usa también ese ancho).
  const stageInset = `${showMachine ? '' : 'lg:left-[19rem]'} ${player.step ? 'lg:right-[27.5rem]' : ''}`

  return (
    <div className="space-backdrop relative h-dvh w-full overflow-hidden">
      {showMachine ? (
        <MachineStage
          machine={machine}
          state={machineNow}
          stepKey={player.index}
          className={stageInset}
        />
      ) : drawable ? (
        <UniverseStage
          domain={project.domain}
          layers={layers}
          step={player.step}
          stepKey={player.index}
          selected={selected}
          onSelect={select}
          spin={spin}
          marks={marks}
          className={stageInset}
        />
      ) : (
        <EmptyUniverse
          reason={
            project.domain.length === 0
              ? 'empty'
              : project.domain.length > MAX_DRAWN_ELEMENTS
                ? 'too-big'
                : 'no-webgl'
          }
          size={project.domain.length}
          examples={examples}
          onLoadExample={loadExample}
          onConfigure={() => setConfigTab(project.constants.length + project.predicates.length + project.functions.length > 0 ? 'interpretacion' : 'lenguaje')}
        />
      )}

      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onMessage={setMessage}
        examples={examples}
        onLoadExample={loadExample}
        onOpenConfig={setConfigTab}
        status={status}
        viewToggle={<ViewToggle view={shownView} onChange={changeView} machineReady={machineReady} />}
      />

      {message && (
        <div
          role="status"
          className={`fixed top-24 left-1/2 z-30 flex w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 items-start justify-between gap-4 px-4 py-2 text-sm ${floating}`}
        >
          <p>{message}</p>
          <button type="button" onClick={() => setMessage(null)} className="text-muted">
            Cerrar
          </button>
        </div>
      )}
      {languageCheck.error && (
        <p className={`fixed top-24 left-3 z-30 px-3 py-2 text-sm text-false ${floating}`}>
          {languageCheck.error}
        </p>
      )}

      {(drawable || showMachine) && (
        <div className={`fixed top-24 left-3 z-20 hidden space-y-2 sm:block ${showMachine ? 'max-w-72' : 'w-72'}`}>
        <aside className={`px-4 py-3 ${floating}`} aria-label="Leyenda">
          {showMachine ? (
            <details>
              <summary className="cursor-pointer text-sm font-bold select-none">
                ¿Cómo leer la máquina?
              </summary>
              <div className="mt-2">
                <MachineLegend machine={machine} />
              </div>
            </details>
          ) : (
            <Legend layers={layers} />
          )}
          {!showMachine && (
          <>
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} />
            Girar solo
          </label>
          <p className="mt-1 text-xs text-muted">
            Arrastra para girar, rueda para acercar, clic en un elemento para ver sus datos.
          </p>
          </>
          )}
        </aside>
        {selected && !showMachine && (
          <ElementCard
            element={selected}
            project={project}
            layers={layers}
            onClose={() => setPicked(null)}
          />
        )}
        </div>
      )}

      {player.step && (
        <div className="fixed top-24 right-3 z-20 hidden max-h-[calc(100dvh-8rem)] w-[26rem] overflow-y-auto lg:block">
          {story}
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <div className="pointer-events-auto w-full max-w-4xl space-y-2">
          {player.step && <div className="max-h-[40vh] overflow-y-auto lg:hidden">{story}</div>}
          <PlaybackControls
            player={player}
            narration={
              speaker.supported
                ? {
                    on: voiceSettings.narrate,
                    toggle: () => voiceSettings.set({ narrate: !voiceSettings.narrate }),
                  }
                : undefined
            }
          />
          <div className={`max-h-[50vh] overflow-y-auto px-4 py-3 ${floating}`}>
            <FormulaEditor
              compact
              value={project.formula}
              onChange={(formula) => update((p) => ({ ...p, formula }))}
              analysis={analysisData}
              analysisError={hasFormula ? analysis.error : null}
              onSubmit={evaluate}
              voice={{
                language,
                speaker,
                onEvaluate: () => setEvaluateRequested(true),
                onDeclare: (proposal) =>
                  update((p) =>
                    proposal.kind === 'constante'
                      ? ops.addConstant(p, proposal.name)
                      : ops.addSymbol(p, proposal.kind === 'predicado' ? 'predicates' : 'functions', {
                          name: proposal.name,
                          arity: proposal.arity,
                        }),
                  ),
              }}
              action={
                <button
                  type="button"
                  onClick={evaluate}
                  disabled={pending}
                  title="Ctrl + Enter"
                  className="h-[3.25rem] rounded-md bg-accent px-5 font-bold text-surface hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? 'Evaluando…' : 'Evaluar'}
                </button>
              }
            />
            <ResultStrip
              evaluation={evaluation}
              error={evaluationError}
              stale={stale}
              unassigned={unassigned}
              onDetails={() => setShowDetails(true)}
              onPlay={() => setShowGame(true)}
              onEnvironment={() => setConfigTab('entorno')}
              speaker={speaker}
            />
          </div>
        </div>
      </div>

      <Modal open={configTab !== null} onClose={() => setConfigTab(null)} title="Configuración">
        <div role="tablist" aria-label="Secciones" className="mb-4 flex gap-1 border-b border-line">
          {CONFIG_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={configTab === tab.id}
              onClick={() => setConfigTab(tab.id)}
              className={`relative -mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-bold ${
                configTab === tab.id
                  ? 'border-line bg-surface text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              <StatusDot status={status[tab.id]} />
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {configTab === 'lenguaje' && (
            <LanguagePanel diagnostics={languageCheck.data?.diagnostics ?? []} />
          )}
          {configTab === 'interpretacion' && (
            <InterpretationPanel
              diagnostics={languageInvalid ? [] : (interpretationCheck.data?.diagnostics ?? [])}
            />
          )}
          {configTab === 'entorno' && (
            <EnvironmentPanel
              freeVars={freeVars}
              formulaState={!hasFormula ? 'empty' : analysisData?.syntax_tree ? 'ready' : 'invalid'}
              diagnostics={environmentDiagnostics}
            />
          )}
        </div>
      </Modal>

      <Modal open={showGame} onClose={() => setShowGame(false)} title="Juego de Hintikka">
        {evaluation?.ok && !stale && (
          <HintikkaGame project={request} value={evaluation.value ?? null} />
        )}
      </Modal>

      <Modal
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title="Justificación"
        placement="right"
      >
        <ResultPanel evaluation={evaluation} error={evaluationError} pending={pending} stale={stale} />
      </Modal>
    </div>
  )
}

/** Resumen del resultado bajo la fórmula; el detalle se abre en el panel lateral. */
function ResultStrip({
  evaluation,
  error,
  stale,
  unassigned,
  onDetails,
  onPlay,
  onEnvironment,
  speaker,
}: {
  onPlay: () => void
  speaker: Speaker
  evaluation: Evaluation | null
  error: string | null
  stale: boolean
  unassigned: readonly string[]
  onDetails: () => void
  onEnvironment: () => void
}) {
  const link = 'text-sm font-bold text-accent underline-offset-2 hover:underline'
  if (error) return <p className="mt-2 text-sm text-false">{error}</p>
  if (!evaluation) {
    return unassigned.length > 0 ? (
      <p className="mt-2 text-sm text-warn">
        Falta asignar {unassigned.join(', ')} en el entorno.{' '}
        <button type="button" className={link} onClick={onEnvironment}>
          Asignar
        </button>
      </p>
    ) : null
  }
  if (!evaluation.ok) {
    const count = evaluation.diagnostics.filter((d) => d.severity === 'error').length
    return (
      <p className="mt-2 text-sm text-false">
        No se puede evaluar: {count === 1 ? 'hay 1 error' : `hay ${count} errores`} en la entrada.{' '}
        <button type="button" className={link} onClick={onDetails}>
          Ver detalles
        </button>
      </p>
    )
  }
  const value = evaluation.value === true
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${stale ? 'opacity-60' : ''}`}>
      <span
        className={`rounded-md px-2.5 py-0.5 font-bold ${value ? 'bg-true-soft text-true' : 'bg-false-soft text-false'}`}
      >
        {value ? 'Verdadero' : 'Falso'}
      </span>
      <span className="formula min-w-0 truncate text-lg">
        ℐ {value ? '⊨' : '⊭'} {evaluation.explanation?.formula}
      </span>
      {speaker.supported && (
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className={link}
            onClick={() =>
              speaker.speaking ? speaker.stop() : void speaker.speak(evaluation.spoken_summary ?? '')
            }
          >
            {speaker.speaking ? 'Callar' : 'Escuchar'}
          </button>
          <ReadVerdictToggle />
        </span>
      )}
      <button
        type="button"
        className={`${link} ${speaker.supported ? '' : 'ml-auto'}`}
        onClick={onDetails}
      >
        Ver justificación
      </button>
      <button
        type="button"
        disabled={stale}
        title={stale ? 'Evalúa de nuevo para jugar con la fórmula actual' : 'Juego de Hintikka contra la máquina'}
        className="rounded-md bg-accent px-3 py-1 text-sm font-bold text-surface hover:opacity-90 disabled:opacity-50"
        onClick={onPlay}
      >
        Jugar
      </button>
      {stale && (
        <p className="w-full text-sm text-warn">
          Cambiaste la entrada después de evaluar: presiona Evaluar para actualizar.
        </p>
      )}
    </div>
  )
}

/** Leer el veredicto en voz alta cada vez que se evalúa. */
function ReadVerdictToggle() {
  const readVerdict = useVoiceSettings((s) => s.readVerdict)
  const set = useVoiceSettings((s) => s.set)
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      <input
        type="checkbox"
        checked={readVerdict}
        onChange={(e) => set({ readVerdict: e.target.checked })}
      />
      leer siempre
    </label>
  )
}

/** Lo que se ve en lugar de la escena cuando no hay nada que dibujar. */
function EmptyUniverse({
  reason,
  size,
  examples,
  onLoadExample,
  onConfigure,
}: {
  reason: 'empty' | 'too-big' | 'no-webgl'
  size: number
  examples: readonly Example[]
  onLoadExample: (example: Example) => void
  onConfigure: () => void
}) {
  return (
    <div className="absolute inset-x-0 top-28 flex justify-center px-3">
      <div className={`w-full max-w-xl px-6 py-5 ${floating}`}>
        {reason === 'empty' ? (
          <>
            <p className="text-xl font-bold">Tu universo está vacío</p>
            <p className="mt-1 text-muted">
              Define un lenguaje y una interpretación con su dominio 𝒟, o empieza con un ejemplo de
              las presentaciones del curso.
            </p>
            {examples.length > 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {examples.map((example) => (
                  <li key={example.id}>
                    <button
                      type="button"
                      onClick={() => onLoadExample(example)}
                      className="h-full w-full rounded-lg border border-line bg-surface px-3 py-2 text-left hover:border-accent hover:bg-accent-soft"
                    >
                      <span className="block font-bold">{example.title}</span>
                      <span className="formula block truncate text-muted">
                        {example.project.formula}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : reason === 'too-big' ? (
          <p>
            El dominio tiene {size} elementos; el universo 3D se dibuja hasta con{' '}
            {MAX_DRAWN_ELEMENTS}. La evaluación funciona igual.
          </p>
        ) : (
          <p>
            Este navegador no permite gráficos 3D (WebGL), así que el universo no se muestra. La
            evaluación funciona igual.
          </p>
        )}
        <button
          type="button"
          onClick={onConfigure}
          className="mt-4 rounded-lg bg-accent px-4 py-2 font-bold text-surface hover:opacity-90"
        >
          {reason === 'empty' ? 'Configurar desde cero' : 'Abrir la configuración'}
        </button>
      </div>
    </div>
  )
}
