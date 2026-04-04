/**
 * linkyun-agent 登录成功后返回的 api_key 由服务端 `generateAPIKey` 生成：
 * `"sk-" + hex.EncodeToString(24 random bytes)` → `sk-` + 48 个十六进制字符（见 linkyun-agent/internal/api/handler/auth.go）。
 *
 * 若你在 .env 里看到 sk-ant-…、sk-or-v1-… 等，那是其它厂商的密钥占位，不是 linkyun 登录写入的值。
 */
export const LINKYUN_API_KEY_PATTERN = /^sk-[0-9a-f]{48}$/i;

export function isExpectedLinkyunApiKeyShape(key: string): boolean {
  return LINKYUN_API_KEY_PATTERN.test(key.trim());
}

export const LINKYUN_API_KEY_FORMAT_HINT =
  "正常约 51 字符：sk- 开头 + 48 位十六进制（与 sk-ant- / sk-or-v1- 无关）";
