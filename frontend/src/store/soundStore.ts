import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Preferencias de sonido; se guardan en el navegador. */
interface SoundSettings {
  enabled: boolean
  set: (settings: Partial<Omit<SoundSettings, 'set'>>) => void
}

export const useSoundSettings = create<SoundSettings>()(
  persist(
    (set) => ({
      enabled: true,
      set: (settings) => set(settings),
    }),
    { name: 'evaluador-semantico:sonido', version: 1 },
  ),
)
