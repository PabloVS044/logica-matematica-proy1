import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CayleyTable, MappingDiagram, RelationGraph, TagMap } from './diagrams'

const domain = ['1', '2', '3']

describe('diagramas', () => {
  it('en el grafo, tocar origen y destino pone la flecha', async () => {
    const toggle = vi.fn()
    render(<RelationGraph name="R" color="#000" domain={domain} has={() => false} toggle={toggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Flecha desde 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Flecha de 1 a 2' }))
    expect(toggle).toHaveBeenCalledWith(['1', '2'])
  })

  it('en el diagrama de flechas, la entrada sin valor espera su salida', async () => {
    const set = vi.fn()
    render(<MappingDiagram name="s" domain={domain} valueOf={() => ''} set={set} />)
    await userEvent.click(screen.getByRole('button', { name: 's(1) = 3' }))
    expect(set).toHaveBeenCalledWith('1', '3')
  })

  it('en la tabla de Cayley, tocar una casilla pasa al siguiente valor', async () => {
    const set = vi.fn()
    render(<CayleyTable name="plus" domain={domain} valueOf={() => '1'} set={set} />)
    await userEvent.click(screen.getByRole('button', { name: 'plus(2, 3) = 1' }))
    expect(set).toHaveBeenCalledWith('2', '3', '2')
  })

  it('en el mapa, la etiqueta sin asignar va al elemento que se toca', async () => {
    const onChange = vi.fn()
    render(
      <TagMap domain={domain} kind="variable" tags={[{ id: 'x', label: 'x', value: '', onChange }]} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'x ↦ 2' }))
    expect(onChange).toHaveBeenCalledWith('2')
  })
})
