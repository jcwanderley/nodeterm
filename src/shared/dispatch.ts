/**
 * The model dispatcher ("Despachante"): reads a task, picks a TIER (light / medium / heavy) by
 * plain keyword rules, and maps the tier to an agent the person chose — so mechanical work goes to
 * a cheaper subscription (e.g. Gemini Flash through Antigravity) and hard work to Claude Code.
 *
 * Pure and deterministic on purpose: no model call decides where a task goes, the person can read
 * every rule here, and the dialog always shows the reason and lets them override the pick.
 */
import type { AgentId } from './agents/config'
import type { CustomAgent } from './types'

export type DispatchTier = 'leve' | 'medio' | 'pesado'

export const DISPATCH_TIERS: readonly DispatchTier[] = ['leve', 'medio', 'pesado'] as const

export const DISPATCH_TIER_LABEL: Record<DispatchTier, string> = {
  leve: 'Leve',
  medio: 'Médio',
  pesado: 'Pesado'
}

export const DISPATCH_TIER_HINT: Record<DispatchTier, string> = {
  leve: 'mecânico e barato de conferir: resumir, traduzir, listar, formatar, revisar texto',
  medio: 'texto ou análise que pede capricho, sem mexer em código importante',
  pesado: 'código, depuração, arquitetura, deploy, dados: decisões caras de errar'
}

/** Machine-local tier → agent map (Settings.dispatchRoutes). A missing tier uses the default. */
export type DispatchRoutes = Partial<Record<DispatchTier, AgentId>>

export interface DispatchClassification {
  tier: DispatchTier
  /** Human-readable why, shown in the dialog. */
  reason: string
}

// Word stems, matched against the lower-cased, accent-stripped task. Portuguese first (the person
// writes in pt-BR), English after. A stem matches at a word start, so "resum" hits "resuma" and
// "resumo" but not "presumir".
const HEAVY = [
  'codigo', 'code', 'bug', 'debug', 'depur', 'erro', 'error', 'falha', 'crash', 'stack trace',
  'refator', 'refactor', 'implement', 'feature', 'funcionalidade', 'arquitetur', 'architect',
  'deploy', 'migra', 'banco de dados', 'database', 'sql', 'schema', 'api', 'endpoint', 'teste',
  'test', 'build', 'compil', 'seguranc', 'security', 'autentica', 'auth', 'performance',
  'otimiz', 'optimiz', 'workflow', 'script', 'pipeline', 'integra', 'corrig', 'fix'
]
const LIGHT = [
  'resum', 'summar', 'tradu', 'translat', 'list', 'extra', 'formata', 'format', 'ortograf',
  'spell', 'revis', 'proofread', 'classific', 'classify', 'renome', 'rename', 'legenda', 'caption',
  'titulo', 'title', 'hashtag', 'variac', 'variation', 'sinonim', 'csv', 'json', 'tabela', 'table',
  'converte', 'convert', 'conta ', 'count', 'organiz', 'ordena', 'sort', 'transcri', 'bullet',
  'topico'
]

/** Long tasks are rarely mechanical: past this many characters a light verb is not enough. */
const LONG_TASK = 600

const normalize = (s: string): string =>
  ` ${s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')} `

const hits = (text: string, stems: readonly string[]): string[] =>
  stems.filter((stem) => text.includes(` ${stem}`))

export function classifyTask(task: string): DispatchClassification {
  const text = normalize(task)
  const heavy = hits(text, HEAVY)
  const light = hits(text, LIGHT)
  if (heavy.length > 0) {
    return { tier: 'pesado', reason: `fala de ${heavy.slice(0, 3).join(', ')}` }
  }
  if (task.trim().length > LONG_TASK) {
    return { tier: 'medio', reason: `tarefa longa (${task.trim().length} caracteres)` }
  }
  if (light.length > 0) {
    return { tier: 'leve', reason: `tarefa mecânica: ${light.slice(0, 3).join(', ')}` }
  }
  return { tier: 'medio', reason: 'nenhuma regra específica: nível médio' }
}

/** The light-tier default: the first custom agent built on Antigravity that pins a Flash/low model. */
function lightDefault(customAgents: readonly CustomAgent[]): AgentId {
  const flash = customAgents.find(
    (c) => c.baseAgent === 'antigravity' && /flash[-a-z0-9.]*low|flash/i.test(c.args ?? '')
  )
  return flash ? flash.id : 'antigravity'
}

export function defaultDispatchRoutes(customAgents: readonly CustomAgent[]): Record<DispatchTier, AgentId> {
  return { leve: lightDefault(customAgents), medio: 'antigravity', pesado: 'claude' }
}

/**
 * The tier → agent map in force: the person's saved routes over the defaults, dropping any saved
 * agent that no longer exists (a deleted custom agent falls back instead of opening a broken node).
 */
export function resolveDispatchRoutes(
  saved: DispatchRoutes | undefined,
  customAgents: readonly CustomAgent[],
  known: ReadonlySet<string>
): Record<DispatchTier, AgentId> {
  const defaults = defaultDispatchRoutes(customAgents)
  const out = { ...defaults }
  for (const tier of DISPATCH_TIERS) {
    const pick = saved?.[tier]
    if (typeof pick === 'string' && known.has(pick)) out[tier] = pick
  }
  return out
}

/** settings.json is hand-editable: keep only tier keys whose value is a non-empty string. */
export function sanitizeDispatchRoutes(raw: unknown): DispatchRoutes | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: DispatchRoutes = {}
  for (const tier of DISPATCH_TIERS) {
    const v = (raw as Record<string, unknown>)[tier]
    if (typeof v === 'string' && v.trim() && v.length <= 160) out[tier] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** The prompt the dispatched agent starts with: the task, plus the tier so the agent knows its lane. */
export function dispatchPrompt(task: string, tier: DispatchTier): string {
  const lane =
    tier === 'pesado'
      ? 'Tarefa despachada como PESADA: planeje antes de agir e confira o resultado.'
      : tier === 'leve'
        ? 'Tarefa despachada como LEVE: seja direto e entregue só o que foi pedido.'
        : 'Tarefa despachada como MÉDIA: capriche no resultado, sem escopo extra.'
  return `${task.trim()}\n\n(${lane})`
}
