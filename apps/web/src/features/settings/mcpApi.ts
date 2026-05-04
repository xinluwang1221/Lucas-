import { jsonHeaders, request } from '../../lib/http'
import type {
  BackgroundServiceStatus,
  HermesMcpConfig,
  HermesMcpInstallResult,
  HermesMcpManualConfigRequest,
  HermesMcpServeStatus,
  HermesMcpTestResult,
  HermesMcpToolSelectionRequest,
  HermesMcpToolSelectionResult,
  HermesMcpUpdateResult
} from '../../lib/api'

export async function getHermesMcpConfig(): Promise<HermesMcpConfig> {
  return request('/api/hermes/mcp')
}

export async function getBackgroundStatus(): Promise<BackgroundServiceStatus> {
  return request('/api/background/status')
}

export async function installBackgroundServices(): Promise<BackgroundServiceStatus> {
  return request('/api/background/install', { method: 'POST' })
}

export async function uninstallBackgroundServices(): Promise<BackgroundServiceStatus> {
  return request('/api/background/uninstall', { method: 'POST' })
}

export async function configureHermesMcpServer(config: HermesMcpManualConfigRequest): Promise<HermesMcpInstallResult> {
  return request('/api/hermes/mcp/manual', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(config)
  })
}

export async function updateHermesMcpServer(
  serverId: string,
  config: HermesMcpManualConfigRequest
): Promise<HermesMcpUpdateResult> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(config)
  })
}

export async function setHermesMcpServerTools(
  serverId: string,
  selection: HermesMcpToolSelectionRequest
): Promise<HermesMcpToolSelectionResult> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}/tools`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(selection)
  })
}

export async function getHermesMcpServeStatus(): Promise<HermesMcpServeStatus> {
  return request('/api/hermes/mcp/serve')
}

export async function startHermesMcpServe(): Promise<HermesMcpServeStatus> {
  return request('/api/hermes/mcp/serve/start', { method: 'POST' })
}

export async function stopHermesMcpServe(): Promise<HermesMcpServeStatus> {
  return request('/api/hermes/mcp/serve/stop', { method: 'POST' })
}

export async function testHermesMcpServer(serverId: string): Promise<HermesMcpTestResult> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}/test`, {
    method: 'POST'
  })
}

export async function removeHermesMcpServer(serverId: string): Promise<HermesMcpConfig> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}`, {
    method: 'DELETE'
  })
}

export async function setHermesMcpServerEnabled(serverId: string, enabled: boolean): Promise<HermesMcpConfig> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}/enabled`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ enabled })
  })
}
