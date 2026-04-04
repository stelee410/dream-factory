export { DreamFactory } from "./context.js";
export type { DreamFactoryConfig } from "./context.js";
export { AuthClient } from "./auth/index.js";
export type { LoginRequest, LoginResponse, AuthSession, WorkspaceInfo, SwitchWorkspaceResponse } from "./auth/index.js";
export { CharacterClient } from "./character/index.js";
export type {
  Agent,
  AgentConfig,
  AgentListResponse,
  CharacterProfile,
} from "./character/index.js";
export { AIClient } from "./ai/index.js";
export type { ChatMessage, ChatRequest, ChatResponse } from "./ai/index.js";
export { InterviewEngine } from "./interview/index.js";
export type { CharacterDossier } from "./interview/index.js";
export { ScriptEngine } from "./script/index.js";
export type { Script, Scene, Dialogue, Outline } from "./script/index.js";
export { DIRECTOR_STYLES, mergeDirectorStyles, describeDirectorStyles } from "./director/index.js";
export type { DirectorStyle, DirectorSelection } from "./director/index.js";
export { StoryboardEngine } from "./storyboard/index.js";
export type { Shot, Storyboard, SubSegment, CameraInfo, LightingInfo, AudioInfo } from "./storyboard/index.js";
export { VideoEngine } from "./video/index.js";
export type { VideoClip, VideoOutput } from "./video/index.js";
export { DreamFactoryAgent, ProjectState, AGENT_TOOLS } from "./agent/index.js";
export type { AgentCallbacks, ProjectStatus, DirectorStyleData, ToolContext } from "./agent/index.js";
