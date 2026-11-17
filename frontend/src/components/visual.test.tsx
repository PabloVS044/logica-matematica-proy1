import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { SlotBoard } from './visual'

function Environment() {
  const [env, setEnv] = useState<Record<string, string>>({})
  return (
    <SlotBoard
      domain={['1', '2', '3']}
      slots={['x', 'y'].map((v) => ({
        id: v,
        label: v,
        ariaLabel: `Valor de ${v}`,
        value: env[v] ?? '',
        onChange: (value) => setEnv((e) => ({ ...e, [v]: value })),
      }))}
    />
  )
}

describe('SlotBoard', () => {
  it('al tocar un elemento llena la cajita activa y pasa a la siguiente vacía', async () => {
    render(<Environment />)
    await userEvent.click(screen.getByRole('button', { name: 'Poner 2 en Valor de x' }))
    expect(screen.getByRole('button', { name: 'Valor de x: 2' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Poner 3 en Valor de y' }))
    expect(screen.getByRole('button', { name: 'Valor de y: 3' })).toBeInTheDocument()
  })

  it('se puede elegir otra cajita y vaciarla', async () => {
    render(<Environment />)
    await userEvent.click(screen.getByRole('button', { name: 'Valor de y: sin valor' }))
    await userEvent.click(screen.getByRole('button', { name: 'Poner 1 en Valor de y' }))
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar Valor de y' }))
    expect(screen.getByRole('button', { name: 'Valor de y: sin valor' })).toBeInTheDocument()
  })
})
