import { describe, expect, it } from 'vitest'
import {
  classifyTask,
  defaultDispatchRoutes,
  dispatchPrompt,
  resolveDispatchRoutes,
  sanitizeDispatchRoutes
} from './dispatch'
import type { CustomAgent } from './types'

const flash: CustomAgent = {
  id: 'custom:gemini-leve',
  label: 'Gemini Flash (leve)',
  launchCmd: '',
  baseAgent: 'antigravity',
  args: '--model gemini-3.8-flash-low'
}

describe('classifyTask', () => {
  it('sends code work to the heavy tier', () => {
    expect(classifyTask('corrige o bug no render.mjs').tier).toBe('pesado')
    expect(classifyTask('Implementa a API de pagamentos').tier).toBe('pesado')
  })

  it('sends mechanical text work to the light tier', () => {
    expect(classifyTask('resuma esta transcrição em 5 tópicos').tier).toBe('leve')
    expect(classifyTask('Traduza as legendas para inglês').tier).toBe('leve')
  })

  it('lets heavy words win over light ones', () => {
    expect(classifyTask('resuma o erro do build').tier).toBe('pesado')
  })

  it('does not match a stem in the middle of a word', () => {
    expect(classifyTask('presumir o melhor horário').tier).toBe('medio')
  })

  it('treats long tasks without heavy words as medium', () => {
    expect(classifyTask(`liste ${'ideia '.repeat(150)}`).tier).toBe('medio')
  })

  it('falls back to medium and says why', () => {
    const c = classifyTask('escreva um roteiro de reel sobre foco')
    expect(c.tier).toBe('medio')
    expect(c.reason).toMatch(/médio/)
  })
})

describe('routes', () => {
  const known = new Set(['claude', 'antigravity', flash.id])

  it('defaults light to a Flash custom agent when one exists', () => {
    expect(defaultDispatchRoutes([flash])).toEqual({ leve: flash.id, medio: 'antigravity', pesado: 'claude' })
    expect(defaultDispatchRoutes([]).leve).toBe('antigravity')
  })

  it('keeps saved picks that still exist and drops the rest', () => {
    const r = resolveDispatchRoutes({ medio: 'claude', pesado: 'custom:gone' }, [flash], known)
    expect(r).toEqual({ leve: flash.id, medio: 'claude', pesado: 'claude' })
  })

  it('sanitizes hand-edited settings', () => {
    expect(sanitizeDispatchRoutes({ leve: 'antigravity', x: 'y', medio: 3 })).toEqual({ leve: 'antigravity' })
    expect(sanitizeDispatchRoutes('nope')).toBeUndefined()
  })

  it('appends the lane to the prompt', () => {
    expect(dispatchPrompt('  resuma  ', 'leve')).toBe('resuma\n\n(Tarefa despachada como LEVE: seja direto e entregue só o que foi pedido.)')
  })
})
