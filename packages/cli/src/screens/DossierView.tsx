import React from "react";
import { Box, Text, useInput } from "ink";
import type { CharacterDossier } from "@dreamfactory/core";

interface Props {
  dossier: CharacterDossier;
  savedPath: string;
  onContinue: () => void;
}

export function DossierView({ dossier, savedPath, onContinue }: Props) {
  useInput((input) => {
    if (input === "c") onContinue();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 角色档案生成完成
      </Text>
      <Box height={1} />

      <Text bold>基础信息</Text>
      <Text>  名字: {dossier.basics.name}</Text>
      <Text>  年龄: {dossier.basics.age}</Text>
      <Text>  身份: {dossier.basics.identity}</Text>
      <Box height={1} />

      <Text bold>性格特征</Text>
      {dossier.personality.map((p, i) => (
        <Text key={i}>
          {"  "}• <Text color="yellow">{p.trait}</Text> — {p.description}
        </Text>
      ))}
      <Box height={1} />

      <Text bold>语言风格</Text>
      <Text>  方式: {dossier.speech_style.manner}</Text>
      <Text>  口头禅: {dossier.speech_style.catchphrases.join("、")}</Text>
      <Box height={1} />

      <Text bold>情感特征</Text>
      <Text>  喜好: {dossier.emotions.likes.join("、")}</Text>
      <Text>  厌恶: {dossier.emotions.dislikes.join("、")}</Text>
      <Text>  恐惧: {dossier.emotions.fears.join("、")}</Text>
      <Box height={1} />

      <Text bold>外貌描述</Text>
      <Text>  {dossier.appearance}</Text>
      <Box height={1} />

      <Text color="green">✓ 档案已保存: {savedPath}</Text>
      <Text color="yellow">按 c 继续生成剧本</Text>
    </Box>
  );
}
