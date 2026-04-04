#!/usr/bin/env bash
# 定时检测 Mail Broker 收件箱；若有未读则调用 Cursor Agent CLI 唤醒 agent。
#
# 依赖: curl、python3；PATH 上需有 Cursor Agent CLI（通常为 `agent`，可通过环境变量指定）。
#
# 环境变量（均有与 AGENT.md 一致的默认值）:
#   BROKER_URL          默认 https://acp.linkyun.co
#   INBOX_ADDRESS       默认 linkyun-dream-factory-coder@local
#   AGENT_ID            默认 569e1858-b8ba-49a6-b458-ccbef6884e94
#   WORKSPACE           默认本脚本所在仓库根目录（dream-factory）
#   POLL_INTERVAL_SEC   轮询间隔秒数，默认 60
#   CURSOR_AGENT_BIN    可执行文件；默认依次尝试已设置值、agent、cursor
#   AGENT_EXTRA_ARGS    追加传给 agent 的参数（谨慎包含空格，需自行引用）
#   AGENT_FORCE         若为 1，则传入 --force
#   LOCK_DIR            并发锁目录，避免上一轮 agent 未结束时再次启动
#
# 用法:
#   ./scripts/mail-watch-agent.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BROKER_URL="${BROKER_URL:-https://acp.linkyun.co}"
INBOX_ADDRESS="${INBOX_ADDRESS:-linkyun-dream-factory-coder@local}"
AGENT_ID="${AGENT_ID:-569e1858-b8ba-49a6-b458-ccbef6884e94}"
WORKSPACE="${WORKSPACE:-$REPO_ROOT}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-60}"
LOCK_DIR="${LOCK_DIR:-/tmp/dream-factory-mail-watch-agent.lock}"

INBOX_URL="${BROKER_URL}/messages/inbox/${INBOX_ADDRESS}?agent_id=${AGENT_ID}"

PROMPT='你有新的邮件，根据AGENT.md的设定获取邮件，设置为已读，执行任务，回复或者转发邮件。如果需要完整的上下文信息，可以读取整个thread'

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

resolve_agent_bin() {
  if [[ -n "${CURSOR_AGENT_BIN:-}" && -x "${CURSOR_AGENT_BIN}" ]]; then
    echo "$CURSOR_AGENT_BIN"
    return 0
  fi
  if command -v agent >/dev/null 2>&1; then
    command -v agent
    return 0
  fi
  if command -v cursor >/dev/null 2>&1; then
    command -v cursor
    return 0
  fi
  echo "错误: 未找到 Cursor Agent CLI。请将 agent 加入 PATH，或设置 CURSOR_AGENT_BIN。" >&2
  return 1
}

# stdin: JSON body。未读 -> 退出 0；无未读 -> 1；解析失败 -> 2
has_unread_python() {
  python3 -c '
import json, sys
try:
    raw = sys.stdin.read()
    if not raw.strip():
        sys.exit(1)
    d = json.loads(raw)
except Exception:
    sys.exit(2)

def truthy_unread_count(obj):
    if not isinstance(obj, dict):
        return False
    for k in ("unread_count", "unread", "unread_total"):
        if k in obj:
            try:
                return int(obj[k]) > 0
            except (TypeError, ValueError):
                pass
    return False

if truthy_unread_count(d):
    sys.exit(0)

msgs = []
if isinstance(d, list):
    msgs = d
elif isinstance(d, dict):
    msgs = d.get("messages") or d.get("data") or d.get("items") or []

if not msgs:
    sys.exit(1)

def is_unread(m):
    if not isinstance(m, dict):
        return False
    if m.get("read") is False or m.get("is_read") is False:
        return True
    return False

if any(is_unread(m) for m in msgs):
    sys.exit(0)

read_keys = [m.get("read") for m in msgs if isinstance(m, dict) and "read" in m]
if read_keys and all(v is True for v in read_keys):
    sys.exit(1)

if msgs and not read_keys:
    sys.exit(0)

sys.exit(1)
'
}

fetch_inbox() {
  curl -sfS --max-time 15 --connect-timeout 5 \
    -H "Accept: application/json" \
    "$INBOX_URL"
}

# 0: 有未读；1: 无未读；2: 请求/解析失败
has_unread() {
  local body
  if ! body="$(fetch_inbox)"; then
    return 2
  fi
  if printf '%s' "$body" | has_unread_python; then
    return 0
  fi
  return 1
}

lock_acquire() {
  mkdir "$LOCK_DIR" 2>/dev/null
}

lock_release() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

run_agent() {
  local bin
  bin="$(resolve_agent_bin)" || return 1
  local -a args=(--print --trust --workspace "$WORKSPACE")
  if [[ "${AGENT_FORCE:-0}" == "1" ]]; then
    args+=(--force)
  fi
  if [[ -n "${AGENT_EXTRA_ARGS:-}" ]]; then
    # shellcheck disable=SC2206
    args+=($AGENT_EXTRA_ARGS)
  fi
  args+=("$PROMPT")

  echo "[mail-watch-agent] $(ts) 启动 Cursor Agent: $bin --print --trust --workspace ... (提示词已省略)"
  "$bin" "${args[@]}"
}

tick() {
  local st=0
  has_unread || st=$?

  if [[ "$st" -eq 2 ]]; then
    echo "[mail-watch-agent] $(ts) 无法拉取收件箱（Broker 未启动或网络异常），${POLL_INTERVAL_SEC}s 后重试" >&2
    return 0
  fi

  if [[ "$st" -ne 0 ]]; then
    return 0
  fi

  if ! lock_acquire; then
    echo "[mail-watch-agent] $(ts) 锁占用中（上一趟 agent 可能仍在执行），跳过" >&2
    return 0
  fi

  local ok=0
  run_agent || ok=$?
  lock_release
  if [[ "$ok" -ne 0 ]]; then
    echo "[mail-watch-agent] $(ts) Agent 退出码: $ok" >&2
  fi
}

echo "[mail-watch-agent] 仓库: $WORKSPACE"
echo "[mail-watch-agent] 收件箱: $INBOX_URL"
echo "[mail-watch-agent] 间隔: ${POLL_INTERVAL_SEC}s"

while true; do
  tick || true
  sleep "$POLL_INTERVAL_SEC"
done
