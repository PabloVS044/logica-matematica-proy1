import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useVoiceSettings } from '../store/voiceStore'
import { installSynthesis, lastVoice } from '../test/fakeSpeech'
import { VoiceMenu } from './VoiceMenu'

const VOICES = [
  { name: 'eSpeak Spanish', lang: 'es-419', localService: true },
  { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false },
]

let spoken: string[]
beforeEach(() => {
  spoken = installSynthesis(VOICES)
  useVoiceSettings.setState({ voiceName: null, rate: 1 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('VoiceMenu', () => {
  it('lista las voces de la más natural a la más robótica y prueba la automática', async () => {
    render(<VoiceMenu buttonClass="" />)
    await userEvent.click(screen.getByRole('button', { name: 'Voz' }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual([
      'Automática (la más natural)',
      'Google español de Estados Unidos · buena',
      'eSpeak Spanish · robótica',
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Probar voz' }))
    expect(spoken).toHaveLength(1)
    expect(lastVoice.current).toBe('Google español de Estados Unidos')
  })

  it('guarda la voz y la velocidad elegidas', async () => {
    render(<VoiceMenu buttonClass="" />)
    await userEvent.click(screen.getByRole('button', { name: 'Voz' }))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'eSpeak Spanish')
    expect(useVoiceSettings.getState().voiceName).toBe('eSpeak Spanish')
    await userEvent.click(screen.getByRole('button', { name: 'Probar voz' }))
    expect(lastVoice.current).toBe('eSpeak Spanish')
  })

  it('avisa cuando solo hay voces robóticas', async () => {
    installSynthesis([VOICES[0]])
    render(<VoiceMenu buttonClass="" />)
    await userEvent.click(screen.getByRole('button', { name: 'Voz' }))
    expect(screen.getByText(/Solo hay voces robóticas/)).toBeInTheDocument()
  })
})
