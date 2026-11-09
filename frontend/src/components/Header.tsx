import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { api, type Example, type ProjectIn } from '../api/client'
import { downloadJson } from '../lib/download'
import { fromProjectIn, toProjectIn } from '../lib/project'
import type { Theme } from '../lib/useTheme'
import { useProject, useProjectStore } from '../store/projectStore'
import { Button } from './ui'

export function Header({
  theme,
  onToggleTheme,
  onMessage,
}: {
  theme: Theme
  onToggleTheme: () => void
  onMessage: (message: string) => void
}) {
  const project = useProject()
  const load = useProjectStore((s) => s.load)
  const reset = useProjectStore((s) => s.reset)
  const [examples, setExamples] = useState<Example[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api
      .examples()
      .then(setExamples)
      .catch(() => setExamples([]))
  }, [])

  function loadExample(event: ChangeEvent<HTMLSelectElement>) {
    const example = examples.find((e) => e.id === event.target.value)
    event.target.value = ''
    if (!example) return
    load(fromProjectIn(example.project))
    onMessage(`Se cargó el ejemplo "${example.title}". ${example.description}`)
  }

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

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="formula text-2xl font-semibold">
            ℐ ⊨ φ<span className="sr-only">:</span>
          </h1>
          <p className="text-lg font-bold">Evaluador semántico</p>
          <p className="hidden text-sm text-muted sm:block">MM3032 Lógica Matemática</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Proyecto">
          <select
            aria-label="Cargar un ejemplo del curso"
            defaultValue=""
            onChange={loadExample}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
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
          <Button onClick={() => downloadJson('proyecto-evaluador.json', toProjectIn(project))}>
            Descargar
          </Button>
          <Button onClick={() => fileInput.current?.click()}>Cargar</Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={loadFile}
            className="hidden"
          />
          {confirmReset ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  reset()
                  setConfirmReset(false)
                  onMessage('Se vació el proyecto.')
                }}
              >
                Sí, vaciar todo
              </Button>
              <Button onClick={() => setConfirmReset(false)}>Cancelar</Button>
            </>
          ) : (
            <Button onClick={() => setConfirmReset(true)}>Nuevo</Button>
          )}
          <Button onClick={onToggleTheme} aria-label="Cambiar tema">
            {theme === 'light' ? 'Tema oscuro' : 'Tema claro'}
          </Button>
        </nav>
      </div>
    </header>
  )
}
