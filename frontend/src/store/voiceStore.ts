import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Preferencias de voz; se guardan en el navegador. */
interface VoiceSettings {
  /** Leer en voz alta la fórmula entendida antes de aceptarla. */
  readBack: boolean
  /** Leer el veredicto al evaluar. */
  readVerdict: boolean
  /** Narrar en voz alta cada paso de la animación. */
  narrate: boolean
  set: (settings: Partial<Omit<VoiceSettings, 'set'>>) => void
}

export const useVoiceSettings = create<VoiceSettings>()(
  persist(
    (set) => ({
      readBack: true,
      readVerdict: false,
      narrate: false,
      set: (settings) => set(settings),
    }),
    { name: 'evaluador-semantico:voz', version: 1 },
  ),
)
