import { runHermesGatewayTask, readHermesGatewayStatus, type HermesGatewayTaskParams } from './hermes_gateway.js'
import { runHermesPythonBridge, type HermesBridgeEvent, type HermesBridgeResult } from './hermes_python.js'

export type HermesRuntimeHandle = {
  kind: 'python-bridge' | 'tui-gateway'
  stop: () => void
}

export type HermesRuntimeTaskParams = Omit<HermesGatewayTaskParams, 'onHandle'> & {
  onHandle?: (handle: HermesRuntimeHandle) => void
}

export async function runHermesRuntimeTask(params: HermesRuntimeTaskParams): Promise<HermesBridgeResult> {
  const requestedMode = (process.env.HERMES_COWORK_RUNTIME || 'auto').trim().toLowerCase()
  const canUseGateway = requestedMode !== 'bridge' && isGatewayEligible(params)

  if (canUseGateway) {
    try {
      return await runHermesGatewayTask({
        ...params,
        onHandle: (handle) => params.onHandle?.({ kind: 'tui-gateway', stop: handle.stop })
      })
    } catch (error) {
      if (requestedMode === 'gateway') throw error
      params.onEvent?.({
        type: 'runtime.fallback',
        mode: 'python-bridge',
        reason: error instanceof Error ? error.message : String(error),
        summary: 'Hermes gateway 暂不可用，本轮已回退到 Python bridge。'
      })
    }
  }

  return runHermesPythonBridge({
    ...params,
    onProcess: (child) => {
      params.onHandle?.({
        kind: 'python-bridge',
        stop: () => child.kill('SIGTERM')
      })
    }
  })
}

export async function readHermesRuntimeAdapterStatus(workspacePath: string) {
  const requestedMode = (process.env.HERMES_COWORK_RUNTIME || 'auto').trim().toLowerCase()
  const gateway = await readHermesGatewayStatus(workspacePath)
  return {
    requestedMode,
    activeMode: requestedMode === 'bridge' ? 'python-bridge' : gateway.available ? 'tui-gateway' : 'python-bridge',
    gateway,
    bridge: {
      available: true,
      mode: 'python-bridge'
    },
    note:
      requestedMode === 'bridge'
        ? '当前强制使用 Python bridge。'
        : gateway.available
          ? '普通任务会优先使用 Hermes 常驻 gateway；需要预加载 Skill 的任务仍回退到 bridge。'
          : 'Hermes gateway 暂不可用，任务会自动回退到 Python bridge。'
  }
}

function isGatewayEligible(params: HermesRuntimeTaskParams) {
  if (params.skills?.length) return false
  return true
}

export type { HermesBridgeEvent, HermesBridgeResult }
