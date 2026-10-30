/**
 * 桌面 TODO · 外部工具适配层
 * 当前仅提供统一的连接状态入口；真实同步需要各平台 OAuth 应用配置。
 */
const PROVIDERS = [
  { id: 'github', name: 'GitHub', capability: 'repositories' },
  { id: 'jira', name: 'Jira', capability: 'tasks' },
  { id: 'notion', name: 'Notion', capability: 'tasks' },
  { id: 'todoist', name: 'Todoist', capability: 'tasks' },
  { id: 'calendar', name: 'Calendar', capability: 'busy-time' }
]

function listProviders() {
  return PROVIDERS.map((provider) => ({
    ...provider,
    configured: false,
    connected: false
  }))
}

function connectProvider(providerId) {
  if (!PROVIDERS.some((provider) => provider.id === providerId)) {
    return { ok: false, errorCode: 'UNKNOWN_PROVIDER' }
  }
  return { ok: false, errorCode: 'OAUTH_NOT_CONFIGURED' }
}

module.exports = { listProviders, connectProvider }
