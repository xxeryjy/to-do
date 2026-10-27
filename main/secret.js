/**
 * 桌面 TODO · 敏感信息加密
 * 用 Electron safeStorage（Windows=DPAPI / macOS=Keychain）加密 QQ 授权码，
 * 避免明文落库。safeStorage 不可用时退化为明文；对历史明文（无 enc: 前缀）
 * 向下兼容，解密侧自动识别。
 */
const { safeStorage } = require('electron')

const PREFIX = 'enc:'

/** safeStorage 当前是否可用（需 app 已 ready） */
function available() {
  try {
    return !!safeStorage && safeStorage.isEncryptionAvailable()
  } catch (e) {
    return false
  }
}

/**
 * 明文 → 可存储字符串
 * 加密成功返回 `enc:` + base64；不可用或失败则返回原串（无前缀，按明文处理）。
 */
function encrypt(text) {
  if (!text) return text
  if (!available()) return text
  try {
    const buf = safeStorage.encryptString(text)
    return PREFIX + buf.toString('base64')
  } catch (e) {
    return text
  }
}

/**
 * 可存储字符串 → 明文
 * 识别 `enc:` 前缀则解密；无前缀视为历史明文直接返回；解密失败兜底返回裸串。
 */
function decrypt(stored) {
  if (!stored) return stored
  if (!stored.startsWith(PREFIX)) return stored
  const raw = stored.slice(PREFIX.length)
  if (!available()) return raw
  try {
    const buf = Buffer.from(raw, 'base64')
    return safeStorage.decryptString(buf)
  } catch (e) {
    return raw
  }
}

module.exports = { encrypt, decrypt }
