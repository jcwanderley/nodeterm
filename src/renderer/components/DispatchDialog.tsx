import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogStack } from './dialog-stack'
import type { AgentId } from '@shared/agents/config'
import {
  classifyTask,
  DISPATCH_TIER_HINT,
  DISPATCH_TIER_LABEL,
  DISPATCH_TIERS,
  type DispatchTier
} from '@shared/dispatch'

export interface DispatchAgentOption {
  id: AgentId
  label: string
}

interface DispatchDialogProps {
  /** Every agent the person can open here (builtins shown in menus + custom agents). */
  agents: readonly DispatchAgentOption[]
  /** The tier → agent map in force (saved routes over the defaults). */
  routes: Record<DispatchTier, AgentId>
  onSubmit: (v: { task: string; tier: DispatchTier; agentId: AgentId; remember: boolean }) => void
  onCancel: () => void
}

/**
 * "Despachar tarefa…": the person types a task, the dispatcher (@shared/dispatch) proposes a tier
 * and the agent mapped to it, shows WHY, and opens that agent pre-prompted with the task. Every
 * pick is overridable; "remember" saves the agent as the tier's default (Settings.dispatchRoutes).
 * Same `.confirm*` shell as SpawnTeamDialog: the input is a textarea, so submit is Ctrl+Enter.
 */
export function DispatchDialog({ agents, routes, onSubmit, onCancel }: DispatchDialogProps) {
  const [task, setTask] = useState('')
  const [manualTier, setManualTier] = useState<DispatchTier | null>(null)
  const [manualAgent, setManualAgent] = useState<AgentId | null>(null)
  const [remember, setRemember] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useDialogStack()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const auto = useMemo(() => classifyTask(task), [task])
  const tier = manualTier ?? auto.tier
  const agentId = manualAgent ?? routes[tier]
  const labelOf = (id: AgentId): string => agents.find((a) => a.id === id)?.label ?? id
  const canSubmit = task.trim().length > 0

  const submit = (): void => {
    if (canSubmit) onSubmit({ task, tier, agentId, remember: remember && agentId !== routes[tier] })
  }

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <p className="confirm__msg">
          Despachar tarefa: descreva o que precisa, o despachante escolhe o nível e o agente (e a
          assinatura) e abre o agente já com a tarefa.
        </p>
        <textarea
          ref={inputRef}
          className="confirm__input confirm__textarea"
          value={task}
          placeholder="Ex.: resuma a transcrição em analise/transcricoes em 5 tópicos"
          rows={5}
          spellCheck={false}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '10px 0 4px' }}>
          <span style={{ opacity: 0.7, marginRight: 4 }}>Nível</span>
          {DISPATCH_TIERS.map((t) => (
            <button
              key={t}
              type="button"
              className={`confirm__btn${t === tier ? ' primary' : ''}`}
              title={DISPATCH_TIER_HINT[t]}
              onClick={() => {
                setManualTier(t === auto.tier ? null : t)
                setManualAgent(null)
              }}
            >
              {DISPATCH_TIER_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="confirm__msg" style={{ opacity: 0.75, margin: '2px 0 10px' }}>
          {manualTier
            ? `Nível escolhido por você (${DISPATCH_TIER_HINT[tier]}).`
            : task.trim()
              ? `Automático: ${auto.reason}.`
              : DISPATCH_TIER_HINT[tier]}
        </p>
        <label className="confirm__option" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ opacity: 0.7 }}>Agente</span>
          <select
            className="confirm__input"
            style={{ flex: 1, margin: 0 }}
            value={agentId}
            onChange={(e) => setManualAgent(e.target.value === routes[tier] ? null : e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.id === routes[tier] ? ` (padrão do nível ${DISPATCH_TIER_LABEL[tier].toLowerCase()})` : ''}
              </option>
            ))}
          </select>
        </label>
        {agentId !== routes[tier] && (
          <label className="confirm__option">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Usar {labelOf(agentId)} como padrão do nível {DISPATCH_TIER_LABEL[tier].toLowerCase()}
          </label>
        )}
        <div className="confirm__actions">
          <button className="confirm__btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className="confirm__btn primary" disabled={!canSubmit} onClick={submit}>
            Despachar para {labelOf(agentId)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
