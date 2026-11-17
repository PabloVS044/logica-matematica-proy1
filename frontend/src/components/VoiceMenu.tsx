import { useEffect, useRef, useState } from 'react'

import { synthesisSupported, voiceQuality } from '../lib/speech'
import { useSpeaker, useVoices } from '../lib/useSpeaker'
import { useVoiceSettings } from '../store/voiceStore'
import { floating } from './ui'

const SAMPLE = 'Para todo equis, pe de equis implica cu de equis. Verdadero: se comprobó con cada elemento.'

/** Elegir la voz con que la aplicación lee en voz alta, y su velocidad. */
export function VoiceMenu({ buttonClass }: { buttonClass: string }) {
  const [open, setOpen] = useState(false)
  const voices = useVoices()
  const speaker = useSpeaker()
  const voiceName = useVoiceSettings((s) => s.voiceName)
  const rate = useVoiceSettings((s) => s.rate)
  const set = useVoiceSettings((s) => s.set)
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

  if (!synthesisSupported()) return null
  const onlyRobotic = voices.length > 0 && voices.every((v) => voiceQuality(v) === 'robótica')

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={buttonClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="Voz de lectura"
      >
        Voz
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Voz de lectura"
          className={`absolute right-0 z-40 mt-2 w-80 space-y-3 p-4 ${floating}`}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-bold">Voz</span>
            <select
              value={voiceName ?? ''}
              onChange={(e) => set({ voiceName: e.target.value || null })}
              className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Automática (la más natural)</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} · {voiceQuality(v)}
                </option>
              ))}
            </select>
          </label>
          {voices.length === 0 && (
            <p className="text-sm text-muted">Este navegador no tiene voces en español.</p>
          )}
          {onlyRobotic && (
            <p className="text-sm text-warn">
              Solo hay voces robóticas. En Edge hay voces naturales de Microsoft; en Chrome, las
              voces de Google aparecen con conexión a internet.
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1 flex justify-between font-bold">
              Velocidad <span className="font-normal text-muted tabular-nums">{rate.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              min={0.75}
              max={1.3}
              step={0.05}
              value={rate}
              onChange={(e) => set({ rate: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </label>
          <button
            type="button"
            onClick={() => (speaker.speaking ? speaker.stop() : void speaker.speak(SAMPLE))}
            className="w-full rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-surface hover:opacity-90"
          >
            {speaker.speaking ? 'Detener' : 'Probar voz'}
          </button>
        </div>
      )}
    </div>
  )
}
