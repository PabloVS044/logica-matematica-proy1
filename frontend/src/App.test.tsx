import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('muestra el título', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Evaluador semántico' })).toBeInTheDocument()
  })
})
