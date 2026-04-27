import type { ModelConfig } from "../types/index.js";

export const TESTNET_MODELS: ModelConfig[] = [
  {
    name: "qwen/qwen-2.5-7b-instruct",
    provider: "0xa48f01287233509FD694a22Bf840225062E67836",
  },
];

export const MAINNET_MODELS: ModelConfig[] = [
  {
    name: "deepseek/deepseek-chat-v3-0324",
    provider: "0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0",
  },
  {
    name: "zai-org/GLM-5-FP8",
    provider: "0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C",
  },
  {
    name: "qwen3.6-plus",
    provider: "0x992e6396157Dc4f22E74F2231235D7DE62696db5",
  },
];

export const AGENT_NAMES: Record<string, string> = {
  "qwen/qwen-2.5-7b-instruct": "Agent Alpha",
  "deepseek/deepseek-chat-v3-0324": "Agent Beta",
  "zai-org/GLM-5-FP8": "Agent Gamma",
  "qwen3.6-plus": "Agent Alpha",
};
