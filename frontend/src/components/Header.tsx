import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'

import type { Example, ProjectIn } from '../api/client'
import { downloadJson } from '../lib/download'
import { fromProjectIn, toProjectIn } from '../lib/project'
import { CONFIG_TABS, type ConfigStatus, type ConfigTab } from '../lib/config'
import type { Theme } from '../lib/useTheme'
import { useProject, useProjectStore } from '../store/projectStore'
import { floating } from './ui'

const barButton =
  'relative rounded-lg px-3 py-1.5 text-sm font-bold text-ink hover:bg-sunken focus-visible:bg-sunken'

export function StatusDot({ status }: { status: 'ok' | 'pending' | 'error' }) {
  if (status === 'ok') return null
  return (
    <span
      className={`absolute top-1 right-1 h-2 w-2 rounded-full ${status === 'error' ? 'bg-false' : 'bg-warn'}`}
    >
      <span className="sr-only">{status === 'error' ? ' (con errores)' : ' (pendiente)'}</span>
    </span>
  )
}

export function Header({
  theme,
  onToggleTheme,
  onMessage,
  examples,
  onLoadExample,
  onOpenConfig,
  status,
  viewToggle,
}: {
  theme: Theme
  onToggleTheme: () => void
  onMessage: (message: string) => void
  examples: readonly Example[]
  onLoadExample: (example: Example) => void
  onOpenConfig: (tab: ConfigTab) => void
  status: ConfigStatus
  /** Selector de vista (Universo / Máquina), siempre visible en la barra. */
  viewToggle?: ReactNode
}) {
  function loadExample(event: ChangeEvent<HTMLSelectElement>) {
    const example = examples.find((e) => e.id === event.target.value)
    event.target.value = ''
    if (example) onLoadExample(example)
  }

  return (
    <header className={`fixed inset-x-3 top-3 z-30 ${floating}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="formula text-2xl font-semibold">
            ℐ ⊨ φ<span className="sr-only">:</span>
          </h1>
          <p className="hidden font-bold md:block">Evaluador semántico</p>
        </div>

        <nav aria-label="Configuración" className="flex items-center gap-1">
          {CONFIG_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={barButton}
              onClick={() => onOpenConfig(tab.id)}
            >
              {tab.label}
              <StatusDot status={status[tab.id]} />
            </button>
          ))}
        </nav>

        {viewToggle}

        <div className="flex items-center gap-2">
          <select
            aria-label="Cargar un ejemplo del curso"
            defaultValue=""
            onChange={loadExample}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Ejemplos del curso
            </option>
            {examples.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <ProjectMenu onMessage={onMessage} />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
            title={theme === 'light' ? 'Tema oscuro' : 'Tema claro'}
            className={`${barButton} text-lg leading-none`}
          >
            {theme === 'light' ? '☾' : '☀'}
          </button>
        </div>
      </div>
    </header>
  )
}

function ProjectMenu({ onMessage }: { onMessage: (message: string) => void }) {
  const project = useProject()
  const load = useProjectStore((s) => s.load)
  const reset = useProjectStore((s) => s.reset)
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as ProjectIn
      load(fromProjectIn(data))
      onMessage(`Se cargó el proyecto "${file.name}".`)
    } catch {
      onMessage(`No se pudo leer "${file.name}": no es un proyecto JSON válido.`)
    }
  }

  const item = 'block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-sunken'
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={barButton}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setConfirmReset(false)
        }}
      >
        Proyecto ▾
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        onChange={loadFile}
        className="hidden"
      />
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              downloadJson('proyecto-evaluador.json', toProjectIn(project))
              setOpen(false)
            }}
          >
            Descargar (JSON)
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              fileInput.current?.click()
              setOpen(false)
            }}
          >
            Cargar…
          </button>
          {confirmReset ? (
            <div className="mt-1 border-t border-line px-2 pt-2 pb-1">
              <p className="mb-2 text-sm">¿Vaciar todo el proyecto?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-1 text-sm text-false hover:bg-false-soft"
                  onClick={() => {
                    reset()
                    setOpen(false)
                    onMessage('Se vació el proyecto.')
                  }}
                >
                  Sí, vaciar
                </button>
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-1 text-sm hover:bg-sunken"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={`${item} text-false`}
              onClick={() => setConfirmReset(true)}
            >
              Nuevo proyecto…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
