import React, { useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

const SPLASH_MS = 2000;

/** 顶部品牌与说明区，在「加载」与「登录」阶段均保留，不消失 */
export function SplashBranding() {
  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Text bold color="cyan">
          {"  "}✦ DreamFactory · 梦工厂
        </Text>
        <Text color="magenta">{"  "}AI 短剧 · 智能创作工作站</Text>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>{"  "}▸ 请使用 https://linkyun.co 账号登录</Text>
          <Text dimColor>{"  "}▸ 遇到问题可微信联系 stephenliy</Text>
        </Box>
      </Box>
      <Box flexDirection="row" marginTop={1} paddingLeft={2}>
        <Text dimColor>══════════════════════════════════════</Text>
      </Box>
    </Box>
  );
}

/** Intro 阶段：品牌区 + 底部加载动画，结束后触发 onDone（进入登录等下一屏） */
export function StartupSplash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <Box flexDirection="column">
      <SplashBranding />
      <Box paddingLeft={3} paddingBottom={1}>
        <Text color="gray">
          <Spinner type="dots" /> 正在就绪…
        </Text>
      </Box>
    </Box>
  );
}
