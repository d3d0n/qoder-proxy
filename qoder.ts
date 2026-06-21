import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const COSY_VERSION = "1.0.22";
const APPCODE = "cosy";
const SIG_SECRET = "d2FyLCB3YXIgbmV2ZXIgY2hhbmdlcw==";
const DEFAULT_JOB_TOKEN_URL = "https://center.qoder.sh/algo/api/v3/user/jobToken?Encode=1";
const DEFAULT_CHAT_URL =
  "https://api2.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1";
const DEFAULT_MODEL_LIST_URL = "https://api2.qoder.sh/algo/api/v2/model/list?Encode=1";
const DEFAULT_TEMPLATE_PATH = path.join(import.meta.dir, "qoder-baseprompt.json");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

const USER_STATUS_URL = "https://center.qoder.sh/algo/api/v3/user/status?Encode=1";
const QOTA_USAGE_URL = "https://openapi.qoder.sh/api/v2/quota/usage";
const ACTIVITY_URL = "https://openapi.qoder.sh/algo/api/v2/activity";

const BUSINESS_PRODUCT = "cli";
const BUSINESS_TYPE = "agent";
const BUSINESS_VERSION = "1.0.22";
const COSY_SCENE = "assistant";

export function openApiHeaders(securityOauthToken: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${securityOauthToken}`,
    "Cosy-ClientType": "5",
    "Cosy-Version": COSY_VERSION,
    "User-Agent": "qoder/" + COSY_VERSION,
  };
}

const SERVER_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;

const CUSTOM_ALPHABET = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
const STD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CUSTOM_PAD = "$";
const S2C = new Uint8Array(128);
for (let i = 0; i < 128; i++) {
  S2C[i] = 255;
}
for (let i = 0; i < 64; i++) {
  S2C[STD_ALPHABET.charCodeAt(i)] = CUSTOM_ALPHABET.charCodeAt(i);
}
S2C["=".charCodeAt(0)] = CUSTOM_PAD.charCodeAt(0);

const C2S = new Uint8Array(128);
for (let i = 0; i < 128; i++) {
  C2S[i] = 255;
}
for (let i = 0; i < 64; i++) {
  C2S[CUSTOM_ALPHABET.charCodeAt(i)] = STD_ALPHABET.charCodeAt(i);
}
C2S[CUSTOM_PAD.charCodeAt(0)] = "=".charCodeAt(0);

export interface QoderTokens {
  personalToken: string;
  securityOauthToken?: string;
  refreshToken?: string;
  userId?: string;
  userName?: string;
  userType?: string;
  plan?: string;
  expireTime?: number;
  email?: string;
  machineId: string;
  machineToken: string;
  machineType: string;
}

interface JobTokenResponse {
  id?: string;
  name?: string;
  securityOauthToken?: string;
  refreshToken?: string;
  expireTime?: number;
  email?: string;
  plan?: string;
  userType?: string;
}

interface AuthIdentity {
  name: string;
  aid: string;
  uid: string;
  yx_uid: string;
  organization_id: string;
  organization_name: string;
  user_type: string;
  security_oauth_token: string;
  refresh_token: string;
}

interface SessionContext {
  cosyKey: string;
  info: string;
}

interface UpstreamUrls {
  jobTokenUrl: string;
  chatUrl: string;
  modelListUrl: string;
}

export interface ProxyConfig {
  host: string;
  port: number;
  templatePath: string;
  urls: UpstreamUrls;
  tokens: QoderTokens;
}

export interface OpenAITextPart {
  type: "text";
  text: string;
}

export interface OpenAIImageUrlPart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: string;
  };
}

export interface AnthropicImagePart {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

interface AnthropicToolUsePart {
  type: "tool_use";
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicToolResultPart {
  type: "tool_result";
  tool_use_id?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  is_error?: boolean;
}

type MessageContentPart =
  | OpenAITextPart
  | OpenAIImageUrlPart
  | AnthropicImagePart
  | AnthropicToolUsePart
  | AnthropicToolResultPart
  | Record<string, unknown>;

export type OpenAIMessageContent = string | MessageContentPart[] | null;

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: OpenAIMessageContent;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: unknown;
  stream_options?: {
    include_usage?: boolean;
  };
  [key: string]: unknown;
}

interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: string | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: TokenUsage;
}
interface BearerCallOptions {
  url: string;
  body?: unknown;
  method?: "GET" | "POST";
  extraHeaders?: Record<string, string>;
  stream?: boolean;
  signal?: AbortSignal;
}

interface QoderModelDef {
  id: string;
  upstream: string;
  displayName: string;
  maxInputTokens: number;
  vision: boolean;
  reasoning: boolean;
  price_factor: number;
}

const MODEL_CREATED_AT = Math.floor(Date.now() / 1000);

export const QODER_MODELS: readonly QoderModelDef[] = [
  { id: "qd-Auto", upstream: "auto", displayName: "Auto", maxInputTokens: 180_000, vision: true, reasoning: false, price_factor: 1 },
  { id: "qd-Ultimate", upstream: "ultimate", displayName: "Ultimate", maxInputTokens: 180_000, vision: true, reasoning: true, price_factor: 1.6 },
  { id: "qd-Performance", upstream: "performance", displayName: "Performance", maxInputTokens: 272_000, vision: true, reasoning: false, price_factor: 1.1 },
  { id: "qd-Efficient", upstream: "efficient", displayName: "Efficient", maxInputTokens: 180_000, vision: true, reasoning: false, price_factor: 0.3 },
  { id: "qd-Lite", upstream: "lite", displayName: "Lite", maxInputTokens: 180_000, vision: false, reasoning: false, price_factor: 0 },
  { id: "qd-Qwen3.7-Max", upstream: "qmodel_latest", displayName: "Qwen3.7-Max", maxInputTokens: 1_000_000, vision: true, reasoning: false, price_factor: 0.2 },
  { id: "qd-Qwen3.6-Plus", upstream: "qmodel", displayName: "Qwen3.6-Plus", maxInputTokens: 180_000, vision: true, reasoning: false, price_factor: 0.2 },
  { id: "qd-DeepSeek-V4-Pro", upstream: "dmodel", displayName: "DeepSeek-V4-Pro", maxInputTokens: 180_000, vision: true, reasoning: true, price_factor: 0.5 },
  { id: "qd-DeepSeek-V4-Flash", upstream: "dfmodel", displayName: "DeepSeek-V4-Flash", maxInputTokens: 180_000, vision: true, reasoning: true, price_factor: 0.1 },
  { id: "qd-GLM-5.1", upstream: "gm51model", displayName: "GLM-5.1", maxInputTokens: 180_000, vision: true, reasoning: true, price_factor: 0.6 },
  { id: "qd-Kimi-K2.6", upstream: "kmodel", displayName: "Kimi-K2.6", maxInputTokens: 256_000, vision: true, reasoning: false, price_factor: 0.3 },
  { id: "qd-MiniMax-M2.7", upstream: "mmodel", displayName: "MiniMax-M2.7", maxInputTokens: 180_000, vision: true, reasoning: false, price_factor: 0.2 },
] as const;

const MODEL_CONFIGS: Record<string, QoderModelDef> = Object.fromEntries(
  QODER_MODELS.flatMap((model) => [
    [model.id, model],
    [model.upstream, model],
  ]),
);

interface ParsedDelta {
  role?: string;
  content?: string;
  reasoningContent?: string;
  toolCalls?: Array<Record<string, unknown>>;
  finishReason?: string;
  usage?: TokenUsage;
}

interface ToolCallAccumulator {
  index: number;
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = parseOptionalNumber(value);
  return parsed && parsed > 0 ? parsed : fallback;
}

function md5Hex(s: string): string {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

// RFC 1123 date required by Qoder signature headers.

function signSignatureHeader(date: string): string {
  return md5Hex(`${APPCODE}&${SIG_SECRET}&${date}`);
}

function rsaEncryptKey(tempKey: Buffer): Buffer {
  return crypto.publicEncrypt(
    { key: SERVER_PUBKEY_PEM, padding: crypto.constants.RSA_PKCS1_PADDING },
    tempKey,
  );
}

function aesEncryptCbc(plain: Buffer, key: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-cbc", key, key);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

function createCompletionId(): string {
  return `chatcmpl_${crypto.randomBytes(18).toString("hex")}`;
}

function createToolCallId(): string {
  return `call_${crypto.randomBytes(12).toString("hex")}`;
}

/**
 * Generate OpenAI-style tool call ID.
 * OpenAI uses format: "call_" + 24 alphanumeric characters
 */
function generateOpenAIToolId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'call_';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Normalize tool call ID to OpenAI format.
 * OpenAI uses simple alphanumeric IDs like "call_abc123...", not Anthropic's "toolu_*" format.
 * If the upstream ID is too short, generate a new one.
 */
function normalizeToolCallId(id: string | undefined, index: number): string {
  if (!id) {
    return generateOpenAIToolId();
  }
  // Strip Anthropic prefix if present (for compatibility)
  if (id.startsWith("toolu_")) {
    id = id.slice(6);
  }
  // If ID is too short (< 20 chars after stripping), generate a new one
  if (id.length < 20) {
    return generateOpenAIToolId();
  }
  return id;
}

function generateMachineIdentity(): Pick<QoderTokens, "machineId" | "machineToken" | "machineType"> {
  const machineId = crypto.randomUUID();
  const machineToken = machineId;
  const machineType = "5";
  return { machineId, machineToken, machineType };
}

function buildIdentity(tokens: QoderTokens): AuthIdentity {
  return {
    name: tokens.userName || "",
    aid: tokens.userId || "",
    uid: tokens.userId || "",
    yx_uid: "",
    organization_id: "",
    organization_name: "",
    user_type: tokens.userType || "personal_standard",
    security_oauth_token: tokens.securityOauthToken || "",
    refresh_token: tokens.refreshToken || "",
  };
}

function buildSessionContext(identity: AuthIdentity): SessionContext {
  const tempKey = Buffer.from(crypto.randomUUID().replace(/-/g, "").slice(0, 16), "ascii");
  const cosyKey = rsaEncryptKey(tempKey).toString("base64");
  const info = aesEncryptCbc(Buffer.from(JSON.stringify(identity), "utf8"), tempKey).toString("base64");
  return { cosyKey, info };
}

function buildPayloadB64(info: string): string {
  return Buffer.from(
    JSON.stringify({
      version: "v1",
      requestId: crypto.randomUUID(),
      info,
      cosyVersion: COSY_VERSION,
      ideVersion: "",
    }),
    "utf8",
  ).toString("base64");
}

function signBearerRequest(payloadB64: string, cosyKey: string, cosyDate: string, body: string, pathSig: string): string {
  return md5Hex(`${payloadB64}\n${cosyKey}\n${cosyDate}\n${body}\n${pathSig}`);
}

function pathSigFromUrl(fullUrl: string): string {
  const url = new URL(fullUrl);
  return url.pathname.startsWith("/algo") ? url.pathname.slice("/algo".length) : url.pathname;
}

export function encodeQoderPayload(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  const std = bytes.toString("base64");
  const length = std.length;
  const offset = Math.floor(length / 3);
  const rearranged = std.slice(length - offset) + std.slice(offset, length - offset) + std.slice(0, offset);
  const out = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++) {
    const code = rearranged.charCodeAt(i);
    const mapped = code < 128 ? S2C[code] : undefined;
    if (mapped === undefined || mapped === 255) {
      throw new Error(`char out of alphabet: ${rearranged[i]}`);
    }
    out[i] = mapped;
  }
  return out.toString("ascii");
}

function signatureHeaders(tokens: QoderTokens): Record<string, string> {
  const date = new Date().toUTCString();
  return {
    "cosy-machinetoken": tokens.machineToken,
    "cosy-machinetype": tokens.machineType,
    "login-version": "v2",
    appcode: APPCODE,
    accept: "application/json",
    "accept-encoding": "identity",
    "cosy-version": COSY_VERSION,
    "cosy-clienttype": "5",
    date,
    signature: signSignatureHeader(date),
    "content-type": "application/json",
    "cosy-machineid": tokens.machineId,
    "user-agent": "Go-http-client/2.0",
  };
}

export async function activateQoderPat(
  personalToken: string,
  overrides: Partial<Pick<QoderTokens, "machineId" | "machineToken" | "machineType">> = {},
  urls: UpstreamUrls = { jobTokenUrl: DEFAULT_JOB_TOKEN_URL, chatUrl: DEFAULT_CHAT_URL, modelListUrl: DEFAULT_MODEL_LIST_URL },
): Promise<{ tokens: QoderTokens; jobToken: JobTokenResponse }> {
  const machine = generateMachineIdentity();
  const seed: QoderTokens = {
    personalToken,
    machineId: overrides.machineId || machine.machineId,
    machineToken: overrides.machineToken || machine.machineToken,
    machineType: overrides.machineType || machine.machineType,
  };
  const jobToken = await exchangeJobToken(seed, urls);
  if (!jobToken.id) {
    throw new Error("Qoder jobToken response missing id");
  }
  return {
    jobToken,
    tokens: {
      ...seed,
      userId: jobToken.id,
      userName: jobToken.name || "",
      securityOauthToken: jobToken.securityOauthToken || "",
      refreshToken: jobToken.refreshToken || "",
      userType: jobToken.userType || "personal_standard",
      plan: jobToken.plan,
      expireTime: jobToken.expireTime,
      email: jobToken.email,
    },
  };
}

async function exchangeJobToken(tokens: QoderTokens, urls: UpstreamUrls): Promise<JobTokenResponse> {
  const inner = {
    personalToken: tokens.personalToken,
    securityOauthToken: tokens.securityOauthToken || "",
    refreshToken: tokens.refreshToken || "",
    needRefresh: Boolean(tokens.refreshToken),
    authInfo: {},
  };
  const body = encodeQoderPayload(JSON.stringify({ payload: JSON.stringify(inner), encodeVersion: "1" }));
  const response = await fetch(urls.jobTokenUrl, {
    method: "POST",
    headers: signatureHeaders(tokens),
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`jobToken HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as JobTokenResponse;
}

async function bearerFetch(tokens: QoderTokens, opts: BearerCallOptions): Promise<Response> {
  const method = opts.method ?? (opts.body != null ? "POST" : "GET");
  const session = buildSessionContext(buildIdentity(tokens));
  const encodedBody = method === "GET" || opts.body == null ? "" : encodeQoderPayload(JSON.stringify(opts.body));
  const payloadB64 = buildPayloadB64(session.info);
  const cosyDate = String(Math.floor(Date.now() / 1000));
  const pathSig = pathSigFromUrl(opts.url);
  const signature = signBearerRequest(payloadB64, session.cosyKey, cosyDate, encodedBody, pathSig);

  const machineId = tokens.machineId;
  const machineToken = tokens.machineToken || machineId;
  const headers: Record<string, string> = {
    "cosy-data-policy": "agree",
    "cosy-machinetype": "5",
    "cosy-clienttype": "5",
    "cosy-date": cosyDate,
    "cosy-user": tokens.userId || "",
    "cosy-key": session.cosyKey,
    "cache-control": "no-cache",
    "cosy-business-product": BUSINESS_PRODUCT,
    "cosy-business-type": BUSINESS_TYPE,
    "cosy-scene": COSY_SCENE,
    accept: opts.stream ? "text/event-stream" : "application/json",
    authorization: `Bearer COSY.${payloadB64}.${signature}`,
    "accept-encoding": "identity",
    "cosy-version": COSY_VERSION,
    "cosy-machineid": machineId,
    "cosy-machinetoken": machineToken,
    "login-version": "v2",
    "user-agent": "Go-http-client/2.0",
    ...(opts.extraHeaders || {}),
  };

  const init: RequestInit = { method, signal: opts.signal, headers };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    init.body = encodedBody;
  }
  return fetch(opts.url, init);
}

function normalizeImageBlock(block: MessageContentPart): OpenAIImageUrlPart | MessageContentPart {
  if (block.type === "image_url" && isRecord(block.image_url) && typeof block.image_url.url === "string") {
    return block as OpenAIImageUrlPart;
  }
  if (
    block.type === "image"
    && isRecord((block as AnthropicImagePart).source)
    && (block as AnthropicImagePart).source.type === "base64"
    && typeof (block as AnthropicImagePart).source.media_type === "string"
    && typeof (block as AnthropicImagePart).source.data === "string"
  ) {
    return {
      type: "image_url",
      image_url: {
        url: `data:${(block as AnthropicImagePart).source.media_type};base64,${(block as AnthropicImagePart).source.data}`,
      },
    };
  }
  return block;
}

function flattenContentToText(content: OpenAIMessageContent): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
      continue;
    }
    if (block.type === "tool_result") {
      const value = block.content;
      if (typeof value === "string") {
        parts.push(value);
        continue;
      }
      if (Array.isArray(value)) {
        for (const nested of value) {
          if (isRecord(nested) && nested.type === "text" && typeof nested.text === "string") {
            parts.push(nested.text);
          }
        }
      }
    }
  }
  return parts.join("\n");
}

function extractLatestUserPrompt(messages: OpenAIChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "user") continue;
    const prompt = flattenContentToText(message.content);
    if (prompt) return prompt;
  }
  return "";
}

function extractLatestUserImages(messages: OpenAIChatMessage[]): OpenAIImageUrlPart[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "user" || !Array.isArray(message.content)) continue;
    const images: OpenAIImageUrlPart[] = [];
    for (const block of message.content) {
      if (!isRecord(block)) continue;
      const normalized = normalizeImageBlock(block);
      if (
        normalized.type === "image_url"
        && isRecord(normalized.image_url)
        && typeof normalized.image_url.url === "string"
      ) {
        images.push(normalized as OpenAIImageUrlPart);
      }
    }
    if (images.length > 0) return images;
  }
  return [];
}

function normalizeToolCall(raw: unknown): OpenAIToolCall | null {
  if (!isRecord(raw)) return null;
  const fn = isRecord(raw.function) ? raw.function : raw;
  const name = asString(fn.name);
  if (!name) return null;

  let args = "{}";
  if (typeof fn.arguments === "string") {
    args = fn.arguments;
  } else if (rawHasOwn(fn, "arguments")) {
    args = JSON.stringify(fn.arguments ?? {});
  } else if (rawHasOwn(raw, "input")) {
    args = JSON.stringify(raw.input ?? {});
  }

  return {
    id: asString(raw.id) || createToolCallId(),
    type: "function",
    function: {
      name,
      arguments: args,
    },
  };
}

function rawHasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function buildQoderMessages(
  request: ChatCompletionRequest,
  templateMessages?: unknown[] | undefined,
  hasIncomingTools?: boolean,
): Array<Record<string, unknown>> {
  const incomingHasSystem = request.messages.some((m) => m.role === "system");
  const result: Array<Record<string, unknown>> = [];

  if (hasIncomingTools && !incomingHasSystem) {
    const toolDescriptions = (request.tools || [])
      .map((t: any) => {
        const name = t?.function?.name || t?.name;
        const desc = t?.function?.description || t?.description || "No description";
        const params = t?.function?.parameters?.properties || t?.parameters?.properties || {};
        const paramNames = Object.keys(params);
        const paramInfo = paramNames.length > 0
          ? ` Parameters: ${paramNames.join(", ")}`
          : "";
        return `- ${name}: ${desc}${paramInfo}`;
      })
      .filter(Boolean)
      .join("\n");

    const toolNames = (request.tools || [])
      .map((t: any) => t?.function?.name || t?.name)
      .filter(Boolean)
      .join(", ");

    result.push({
      role: "system",
      content: `You are a helpful assistant with access to the following tools:\n\n${toolDescriptions}\n\n## Tool Usage Guidelines:\n\n1. **When to use tools**: When the user's request requires information retrieval, file operations, code execution, or any action that these tools can perform, you MUST call the appropriate tool. Do not say you cannot help; instead, invoke the tool with the correct arguments.\n\n2. **Trust tool results**: After calling a tool, you will receive the tool result in the conversation. The tool result contains the actual data or outcome of the tool execution. Use this information to formulate your response. Do not claim you didn't receive file contents or data if the tool result was provided.\n\n3. **Multi-turn workflows**: For complex tasks requiring multiple tool calls:\n   - Call tools sequentially as needed\n   - Use information from previous tool results to inform subsequent calls\n   - Only respond with your final answer after you have gathered all necessary information\n\n4. **Error handling**: If a tool returns an error or empty result, acknowledge this to the user and suggest alternatives or next steps.\n\n5. **Text-only responses**: Only respond with plain text (without tool calls) when:\n   - No available tool can address the user's request\n   - You already have all the information needed from previous tool results\n   - The user is asking for clarification or a simple answer\n\nAvailable tools: ${toolNames}`,
    });
  } else if (!hasIncomingTools && !incomingHasSystem) {
    result.push({
      role: "system",
      content: "You are a helpful AI assistant. Answer the user's questions clearly and concisely. Maintain context from earlier turns in the conversation.",
    });
  }

  for (const message of request.messages) {
    if (message.role === "tool") {
      result.push({
        role: "tool",
        tool_call_id: message.tool_call_id || "",
        content: flattenContentToText(message.content),
      });
      continue;
    }

    const contents: Array<Record<string, unknown>> = [];
    const toolCalls: OpenAIToolCall[] = [];
    const toolResults: Array<{ tool_call_id: string; content: string }> = [];
    let textContent = "";

    if (typeof message.content === "string") {
      textContent = message.content;
      if (textContent) {
        contents.push({ type: "text", text: textContent });
      }
    } else if (Array.isArray(message.content)) {
      const textParts: string[] = [];
      for (const rawBlock of message.content) {
        if (!isRecord(rawBlock)) continue;
        if (rawBlock.type === "text" && typeof rawBlock.text === "string") {
          textParts.push(rawBlock.text);
          continue;
        }
        if (rawBlock.type === "image_url" || rawBlock.type === "image") {
          const normalized = normalizeImageBlock(rawBlock);
          contents.push(normalized as Record<string, unknown>);
          continue;
        }
        if (rawBlock.type === "tool_use") {
          const toolCall = normalizeToolCall(rawBlock);
          if (toolCall) toolCalls.push(toolCall);
          continue;
        }
        if (rawBlock.type === "tool_result") {
          const toolCallId = asString(rawBlock.tool_use_id);
          if (toolCallId) {
            let content = "";
            if (typeof rawBlock.content === "string") {
              content = rawBlock.content;
            } else if (Array.isArray(rawBlock.content)) {
              content = rawBlock.content
                .map((nested) => (isRecord(nested) && nested.type === "text" && typeof nested.text === "string" ? nested.text : ""))
                .filter(Boolean)
                .join("\n");
            }
            if (rawBlock.is_error === true) {
              content = `[ERROR] ${content}`;
            }
            toolResults.push({ tool_call_id: toolCallId, content });
          }
        }
      }
      textContent = textParts.join("\n");
      if (textContent) {
        contents.unshift({ type: "text", text: textContent });
      }
    }

    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        const normalized = normalizeToolCall(toolCall);
        if (normalized) toolCalls.push(normalized);
      }
    }

    if (message.role === "assistant" && toolCalls.length > 0) {
      result.push({
        role: "assistant",
        content: textContent,
        contents,
        tool_calls: toolCalls,
      });
      continue;
    }

    if (message.role === "user" && toolResults.length > 0) {
      for (const toolResult of toolResults) {
        result.push({
          role: "tool",
          tool_call_id: toolResult.tool_call_id,
          content: toolResult.content,
        });
      }
      if (textContent || contents.length > 0) {
        result.push({
          role: "user",
          content: textContent,
          contents,
        });
      }
      continue;
    }

    result.push({
      role: message.role,
      content: textContent,
      contents,
    });
  }

  return result;
}

/**
 * Derive a stable session_id from a conversation's ANCHOR (the parts that
 * don't change as the conversation grows).
 *
 * Qoder server uses session_id as the key for server-side persisted
 * conversation state (context, tool call records, compaction boundaries).
 * The session_id MUST stay constant across every turn of the same chat —
 * otherwise the server treats each turn as a brand-new conversation, the
 * model "forgets" prior context, and answers loop or repeat themselves.
 *
 * Bug we're fixing: the previous implementation hashed ALL messages, so
 * every new turn (with one more message appended) produced a different
 * session_id. Effectively: every turn = new session = no memory.
 *
 * Fix: hash only the conversation ANCHOR — everything that's stable across
 * turns:
 *   1. All system messages (system prompts don't change mid-conversation)
 *   2. The FIRST user message (the conversation opener)
 *
 * The first user turn is the natural fingerprint of "which conversation
 * is this." Two different chats almost never start with identical opener
 * text, so collisions are rare; the same chat always rehashes to the same
 * value because the anchor never changes.
 */
function deriveSessionId(messages: ChatCompletionRequest["messages"]): string {
  const hash = crypto.createHash("sha256");
  let firstUserSeen = false;

  const updateWithContent = (content: unknown) => {
    if (typeof content === "string") {
      hash.update(content);
    } else if (Array.isArray(content)) {
      for (const block of content as any[]) {
        if (block?.type === "text" && typeof block.text === "string") {
          hash.update(block.text);
        }
      }
    }
  };

  for (const msg of messages) {
    if (msg.role === "system") {
      hash.update("system:");
      updateWithContent(msg.content);
      hash.update("\n");
    } else if (msg.role === "user" && !firstUserSeen) {
      hash.update("user:");
      updateWithContent(msg.content);
      hash.update("\n");
      firstUserSeen = true;
      break;
    }
  }

  if (!firstUserSeen) {
    hash.update("__no_user__");
  }

  const hex = hash.digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function buildChatBody(
  request: ChatCompletionRequest,
  tokens: QoderTokens,
  model: QoderModelDef,
  template: Record<string, unknown> | null,
): Record<string, unknown> {
  const prompt = extractLatestUserPrompt(request.messages);
  const images = extractLatestUserImages(request.messages);
  const requestId = crypto.randomUUID();
  const chatRecordId = crypto.randomUUID();
  const sessionId = deriveSessionId(request.messages);
  const hasIncomingTools = Array.isArray(request.tools) && request.tools.length > 0;

  const body: Record<string, unknown> = {
    request_id: requestId,
    request_set_id: crypto.randomUUID(),
    chat_record_id: chatRecordId,
    session_id: sessionId,
    stream: true,
    chat_task: "FREE_INPUT",
    chat_context: {
      text: { type: "text", text: prompt },
      extra: {
        originalContent: { type: "text", text: prompt },
        modelConfig: { key: model.upstream, is_reasoning: model.reasoning },
      },
    },
    is_reply: true,
    is_retry: false,
    source: 1,
    version: "3",
    agent_id: "agent_common",
    task_id: "common",
    session_type: "cli_craft",
    aliyun_user_type: "",
    messages: buildQoderMessages(request, undefined, hasIncomingTools),
    tools: hasIncomingTools ? request.tools : [],
    parameters: {
      max_tokens: request.max_tokens ?? 8096,
      ...(request.tool_choice !== undefined ? { tool_choice: request.tool_choice } : {}),
    },
    model_config: {
      key: model.upstream,
      display_name: model.displayName,
      is_vl: model.vision,
      is_reasoning: model.reasoning,
      max_input_tokens: model.maxInputTokens,
      format: "openai",
      source: "system",
    },
    business: {
      product: BUSINESS_PRODUCT,
      version: BUSINESS_VERSION,
      type: BUSINESS_TYPE,
      id: crypto.randomUUID(),
      name: prompt.slice(0, 30),
      begin_at: Date.now(),
      stage: "start",
    },
  };

  // Mirror messages[0] system prompt up to top-level body.system
  const sysMsg = (body.messages as any[]).find((m: any) => m?.role === "system");
  if (sysMsg && typeof sysMsg.content === "string") {
    body.system = sysMsg.content;
  }

  if (images.length > 0) {
    (body.chat_context as Record<string, unknown>).images = images;
    (body.chat_context as Record<string, unknown>).imageUrls = images.map((i) => i.image_url.url);
    (body.chat_context as Record<string, unknown>).extra = {
      ...(body.chat_context as Record<string, unknown>).extra as Record<string, unknown>,
      images,
    };
    body.image_urls = images.map((i) => i.image_url.url);
  }

  return body;
}

function zeroUsage(): TokenUsage {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
}

function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateToolCallsTokens(toolCalls: OpenAIToolCall[]): number {
  let total = 0;
  for (const toolCall of toolCalls) {
    total += estimateTextTokens(toolCall.function.name);
    total += estimateTextTokens(toolCall.function.arguments);
  }
  return total;
}

function estimateContentTokens(content: OpenAIMessageContent): number {
  if (typeof content === "string") {
    return estimateTextTokens(content);
  }
  if (!Array.isArray(content)) {
    return 0;
  }

  let total = 0;
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      total += estimateTextTokens(block.text);
      continue;
    }
    if (block.type === "image_url" || block.type === "image") {
      total += 256;
      continue;
    }
    if (block.type === "tool_result") {
      total += estimateTextTokens(flattenContentToText([block]));
    }
  }
  return total;
}

function estimatePromptTokens(messages: OpenAIChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += 4;
    total += estimateContentTokens(message.content);
    if (Array.isArray(message.tool_calls)) {
      total += estimateToolCallsTokens(message.tool_calls);
    }
    if (message.role === "tool" && typeof message.tool_call_id === "string") {
      total += estimateTextTokens(message.tool_call_id);
    }
  }
  return total;
}

function finalizeUsage(
  request: ChatCompletionRequest,
  assistantContent: string,
  assistantToolCalls: OpenAIToolCall[],
  upstreamUsage: TokenUsage,
): TokenUsage {
  if (upstreamUsage.total_tokens > 0) {
    return upstreamUsage;
  }
  const promptTokens = estimatePromptTokens(request.messages);
  const completionTokens = estimateTextTokens(assistantContent) + estimateToolCallsTokens(assistantToolCalls);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

export function parseSseLine(line: string): ParsedDelta | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return null;

  try {
    const wrapper = JSON.parse(data) as Record<string, unknown>;
    const innerRaw = wrapper.body;
    if (typeof innerRaw !== "string" || !innerRaw || innerRaw === "[DONE]") {
      return null;
    }
    const inner = JSON.parse(innerRaw) as Record<string, unknown>;
    const parsed: ParsedDelta = {};

    if (isRecord(inner.usage)) {
      parsed.usage = {
        prompt_tokens: Number(inner.usage.prompt_tokens) || 0,
        completion_tokens: Number(inner.usage.completion_tokens) || 0,
        total_tokens: Number(inner.usage.total_tokens) || 0,
      };
    }

    const choice = Array.isArray(inner.choices) && isRecord(inner.choices[0]) ? inner.choices[0] : null;
    if (!choice) {
      return parsed.usage ? parsed : null;
    }

    const delta = isRecord(choice.delta) ? choice.delta : {};
    if (typeof choice.finish_reason === "string") parsed.finishReason = choice.finish_reason;
    if (typeof delta.role === "string") parsed.role = delta.role;
    if (typeof delta.content === "string") parsed.content = delta.content;
    if (typeof delta.reasoning_content === "string") parsed.reasoningContent = delta.reasoning_content;
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      parsed.toolCalls = delta.tool_calls.filter(isRecord);
    }
    return parsed;
  } catch {
    return null;
  }
}

async function pumpUpstreamSse(
  upstream: ReadableStream<Uint8Array>,
  onDelta: (delta: ParsedDelta) => void | Promise<void>,
): Promise<void> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const STREAM_TIMEOUT = 300_000; // 5 minutes
  let lastActivity = Date.now();

  try {
    while (true) {
      if (Date.now() - lastActivity > STREAM_TIMEOUT) {
        throw new Error(`Stream timeout after ${STREAM_TIMEOUT}ms`);
      }

      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: boolean; value?: Uint8Array }>((_, reject) => {
        setTimeout(() => reject(new Error("Stream read timeout")), STREAM_TIMEOUT);
      });

      const { done, value } = await Promise.race([readPromise, timeoutPromise]);
      if (done) break;
      lastActivity = Date.now();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (!line) continue;

        if (line.startsWith("data:")) {
          const dataStr = line.slice(5).trim();
          if (dataStr && dataStr !== "[DONE]") {
            try {
              const wrapper = JSON.parse(dataStr);
              const svc = wrapper.statusCodeValue;
              if (svc && svc >= 400) {
                const errStatus = wrapper.statusCode || "";
                let errMsg = wrapper.message || "";
                if (typeof errMsg === "string" && errMsg.startsWith("{")) {
                  try { const p = JSON.parse(errMsg); errMsg = p.pricingUrl || JSON.stringify(p); } catch {}
                }
                throw new Error(`Qoder HTTP ${svc} ${errStatus}: ${errMsg.slice(0, 200) || "rate limited or quota exceeded"}`);
              }
            } catch (e) {
              // If it's our own thrown error, re-throw it. Otherwise ignore parse errors.
              if (e instanceof Error && e.message.startsWith("Qoder HTTP")) throw e;
            }
          }
        }

        const parsed = parseSseLine(line);
        if (parsed) {
          await onDelta(parsed);
        }
      }
    }

    if (buffer) {
      const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
      const parsed = parseSseLine(line);
      if (parsed) {
        await onDelta(parsed);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function mergeToolCallDelta(
  acc: ToolCallAccumulator[],
  raw: Record<string, unknown>,
  fallbackIndex: number,
  forcedIndex?: number,
): ToolCallAccumulator {
  const index = forcedIndex ?? (typeof raw.index === "number" ? raw.index : fallbackIndex);
  const existing = acc[index] ?? {
    index,
    id: normalizeToolCallId(undefined, index),
    type: "function" as const,
    function: {
      name: "",
      arguments: "",
    },
  };

  const fn = isRecord(raw.function) ? raw.function : {};
  if (typeof raw.id === "string" && raw.id) {
    existing.id = normalizeToolCallId(raw.id, index);
  }
  if (typeof fn.name === "string" && fn.name) {
    existing.function.name = fn.name;
  }
  if (typeof fn.arguments === "string" && fn.arguments) {
    existing.function.arguments += fn.arguments;
  }
  acc[index] = existing;
  return existing;
}

function resolveModel(modelName: string): QoderModelDef | null {
  return MODEL_CONFIGS[modelName] || null;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function errorResponse(message: string, status: number, type = "invalid_request_error", code: string | null = null): Response {
  return jsonResponse(
    {
      error: {
        message,
        type,
        param: null,
        code,
      },
    },
    { status },
  );
}


function parseRequestBody(value: unknown): ChatCompletionRequest | Response {
  if (!isRecord(value)) {
    return errorResponse("Request body must be a JSON object.", 400);
  }
  if (!asNonEmptyString(value.model)) {
    return errorResponse("`model` must be a non-empty string.", 400);
  }
  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    return errorResponse("`messages` must be a non-empty array.", 400);
  }

  for (const [index, message] of value.messages.entries()) {
    if (!isRecord(message)) {
      return errorResponse(`messages[${index}] must be an object.`, 400);
    }
    if (!["system", "user", "assistant", "tool"].includes(String(message.role))) {
      return errorResponse(`messages[${index}].role is invalid.`, 400);
    }
    if (message.role === "tool" && typeof message.tool_call_id !== "string") {
      return errorResponse(`messages[${index}].tool_call_id is required for tool messages.`, 400);
    }
    if (message.role === "assistant" && message.tool_calls !== undefined && !Array.isArray(message.tool_calls)) {
      return errorResponse(`messages[${index}].tool_calls must be an array when present.`, 400);
    }
  }

  return value as ChatCompletionRequest;
}

export function loadConfig(env: Record<string, string | undefined> = Bun.env): ProxyConfig {
  const machine = generateMachineIdentity();
  return {
    host: asNonEmptyString(env.HOST) || DEFAULT_HOST,
    port: parsePort(env.PORT, DEFAULT_PORT),
    templatePath: asNonEmptyString(env.QODER_BASEPROMPT_PATH) || DEFAULT_TEMPLATE_PATH,
    urls: {
      jobTokenUrl: asNonEmptyString(env.QODER_JOB_TOKEN_URL) || DEFAULT_JOB_TOKEN_URL,
      chatUrl: asNonEmptyString(env.QODER_CHAT_URL) || DEFAULT_CHAT_URL,
      modelListUrl: asNonEmptyString(env.QODER_MODEL_LIST_URL) || DEFAULT_MODEL_LIST_URL,
    },
    tokens: {
      personalToken: "",
      securityOauthToken: asNonEmptyString(env.QODER_SECURITY_OAUTH_TOKEN),
      refreshToken: asNonEmptyString(env.QODER_REFRESH_TOKEN),
      userId: asNonEmptyString(env.QODER_USER_ID),
      userName: asNonEmptyString(env.QODER_USER_NAME),
      userType: asNonEmptyString(env.QODER_USER_TYPE),
      plan: asNonEmptyString(env.QODER_PLAN),
      expireTime: parseOptionalNumber(env.QODER_EXPIRE_TIME),
      email: asNonEmptyString(env.QODER_EMAIL),
      machineId: asNonEmptyString(env.QODER_MACHINE_ID) || machine.machineId,
      machineToken: asNonEmptyString(env.QODER_MACHINE_TOKEN) || machine.machineToken,
      machineType: asNonEmptyString(env.QODER_MACHINE_TYPE) || machine.machineType,
    },
  };
}

class QoderClient {
  private readonly urls: UpstreamUrls;
  private readonly templatePath: string;
  private tokens: QoderTokens;
  private templateSource: string | null | undefined;

  constructor(config: ProxyConfig) {
    this.urls = config.urls;
    this.templatePath = config.templatePath;
    this.tokens = { ...config.tokens };
  }

  private loadTemplate(): Record<string, unknown> | null {
    if (this.templateSource === undefined) {
      try {
        this.templateSource = fs.readFileSync(this.templatePath, "utf8");
      } catch {
        this.templateSource = null;
      }
    }

    if (!this.templateSource) {
      return null;
    }

    const hydrated = this.templateSource
      .replace(/\{UUID[1-5]\}/g, () => crypto.randomUUID())
      .replace(/\{TIME1\}/g, () => String(Date.now()));
    return JSON.parse(hydrated) as Record<string, unknown>;
  }

  private async ensureFreshAuth(): Promise<QoderTokens> {
    const now = Date.now();
    const needsRefresh =
      !this.tokens.securityOauthToken
      || !this.tokens.userId
      || (typeof this.tokens.expireTime === "number" && this.tokens.expireTime - 60_000 < now);

    if (!needsRefresh) {
      return this.tokens;
    }

    const jobToken = await exchangeJobToken(this.tokens, this.urls);
    if (!jobToken.id) {
      throw new Error("jobToken response missing user id");
    }

    this.tokens = {
      ...this.tokens,
      userId: jobToken.id,
      userName: jobToken.name || this.tokens.userName || "",
      securityOauthToken: jobToken.securityOauthToken || this.tokens.securityOauthToken || "",
      refreshToken: jobToken.refreshToken || this.tokens.refreshToken || "",
      userType: jobToken.userType || this.tokens.userType || "personal_standard",
      plan: jobToken.plan || this.tokens.plan,
      expireTime: jobToken.expireTime || this.tokens.expireTime,
      email: jobToken.email || this.tokens.email,
    };
    return this.tokens;
  }


  async fetchModels(): Promise<Array<Record<string, unknown>>> {
    const tokens = await this.ensureFreshAuth();
    const response = await bearerFetch(tokens, {
      url: this.urls.modelListUrl,
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Qoder model list HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      chat?: Array<{
        key: string;
        display_name?: string;
        enable?: boolean;
        is_vl?: boolean;
        is_reasoning?: boolean;
        price_factor?: number;
        max_input_tokens?: number;
        context_config?: Record<string, { token_count?: number; is_default?: boolean }>;
      }>;
    };

    return (data.chat ?? [])
      .filter((m) => m.enable !== false)
      .map((m) => {
        let contextWindow: number | undefined;
        if (m.context_config) {
          for (const cfg of Object.values(m.context_config)) {
            if (cfg.is_default && cfg.token_count) {
              contextWindow = cfg.token_count;
              break;
            }
          }
        }
        const maxInput = m.max_input_tokens ?? contextWindow ?? 128_000;
        return {
          id: m.key,
          object: "model" as const,
          created: MODEL_CREATED_AT,
          owned_by: "qoder",
          name: m.display_name ?? m.key,
          context_length: maxInput,
          max_completion_tokens: Math.min(maxInput, 65_536),
          display_name: m.display_name ?? m.key,
          is_reasoning: m.is_reasoning ?? false,
          supports_vision: m.is_vl ?? false,
          max_input_tokens: maxInput,
          price_factor: m.price_factor ?? 1,
          supports_tools: true,
          supports_streaming: true,
        };
      });
  }

  async openChatStream(request: ChatCompletionRequest, signal?: AbortSignal): Promise<{ upstream: ReadableStream<Uint8Array>; model: QoderModelDef }> {
    const model = resolveModel(request.model);
    if (!model) {
      throw new Error(`Unknown model: ${request.model}`);
    }

    const tokens = await this.ensureFreshAuth();
    const body = buildChatBody(request, tokens, model, this.loadTemplate());
    const response = await bearerFetch(tokens, {
      url: this.urls.chatUrl,
      body,
      stream: true,
      extraHeaders: {
        "x-model-key": model.upstream,
        "x-model-source": "system",
      },
      signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`expired: HTTP ${response.status}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Qoder chat HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!response.body) {
      throw new Error("Qoder response missing body");
    }

    return {
      upstream: response.body,
      model,
    };
  }
}

function createModelsPayload() {
  return {
    object: "list",
    data: QODER_MODELS.map((model) => ({
      id: model.id,
      object: "model",
      created: MODEL_CREATED_AT,
      owned_by: "qoder",
      context_window: model.maxInputTokens,
      vision: model.vision,
      reasoning: model.reasoning,
    })),
  };
}

async function handleChatCompletionJson(client: QoderClient, request: ChatCompletionRequest, signal?: AbortSignal): Promise<Response> {
  const { upstream, model } = await client.openChatStream(request, signal);
  const toolCalls: ToolCallAccumulator[] = [];
  let content = "";
  let finishReason: string | null = null;
  let usage = zeroUsage();

  await pumpUpstreamSse(upstream, (delta) => {
    if (delta.usage) {
      usage = delta.usage;
    }
    if (delta.content) {
      content += delta.content;
    }
    if (delta.toolCalls) {
      for (const rawToolCall of delta.toolCalls) {
        mergeToolCallDelta(toolCalls, rawToolCall, toolCalls.length);
      }
    }
    if (delta.finishReason) {
      finishReason = delta.finishReason;
    }
  });

  const finalToolCalls = toolCalls.filter(Boolean).map((toolCall) => ({
    id: toolCall.id,
    type: toolCall.type,
    function: { ...toolCall.function },
  }));
  const finalUsage = finalizeUsage(request, content, finalToolCalls, usage);

  const response: ChatCompletionResponse = {
    id: createCompletionId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model.id,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content || null,
          ...(finalToolCalls.length > 0 ? { tool_calls: finalToolCalls } : {}),
        },
        finish_reason: finishReason || (finalToolCalls.length > 0 ? "tool_calls" : "stop"),
      },
    ],
    usage: finalUsage,
  };

  return jsonResponse(response);
}

async function handleChatCompletionStream(client: QoderClient, request: ChatCompletionRequest, signal?: AbortSignal): Promise<Response> {
  const { upstream, model } = await client.openChatStream(request, signal);
  const completionId = createCompletionId();
  const encoder = new TextEncoder();
  const includeUsage = request.stream_options?.include_usage === true;

  const upstreamToolCalls: ToolCallAccumulator[] = [];
  let sentRole = false;
  let content = "";
  let finishReason: string | null = null;
  let usage = zeroUsage();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const enqueue = (chunk: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      try {
        await pumpUpstreamSse(upstream, (delta) => {
          if (delta.usage) usage = delta.usage;

          if (!sentRole) {
            enqueue({
              id: completionId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: model.id,
              choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
            });
            sentRole = true;
          }

          if (delta.reasoningContent) {
            enqueue({
              id: completionId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: model.id,
              choices: [{ index: 0, delta: { reasoning_content: delta.reasoningContent }, finish_reason: null }],
            });
          }

          if (delta.content) {
            content += delta.content;
            enqueue({
              id: completionId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: model.id,
              choices: [{ index: 0, delta: { content: delta.content }, finish_reason: null }],
            });
          }

          if (delta.toolCalls) {
            for (const raw of delta.toolCalls) {
              const idx = typeof raw.index === "number" ? raw.index : 0;
              mergeToolCallDelta(upstreamToolCalls, raw, idx, idx);
            }
          }

          if (delta.finishReason) {
            finishReason = delta.finishReason;
          }
        });

        const completeCalls = upstreamToolCalls.filter((tc) => tc && tc.function.name);

        if (completeCalls.length > 0) {
          enqueue({
            id: completionId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: model.id,
            choices: [{ index: 0, delta: { tool_calls: completeCalls.map((tc, i) => ({ index: i, id: tc.id, type: "function" as const, function: { name: tc.function.name, arguments: tc.function.arguments } })) }, finish_reason: null }],
          });
        }

        enqueue({
          id: completionId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: model.id,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason || (completeCalls.length > 0 ? "tool_calls" : "stop") }],
        });

        if (includeUsage) {
          enqueue({
            id: completionId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: model.id,
            choices: [],
            usage: finalizeUsage(request, content, completeCalls.map((tc) => ({ id: tc.id, type: "function" as const, function: { ...tc.function } })), usage),
          });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("cancelled") || message.includes("aborted") || message.includes("closed")) {
          // Client disconnected
        } else {
          enqueue({ error: { message, type: "api_error" } });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function createProxyHandler(config: ProxyConfig) {
  const clientsByPat = new Map<string, QoderClient>();

  function getClient(pat: string): QoderClient {
    const existing = clientsByPat.get(pat);
    if (existing) return existing;
    const machine = generateMachineIdentity();
    const client = new QoderClient({
      ...config,
      tokens: {
        personalToken: pat,
        machineId: machine.machineId,
        machineToken: machine.machineToken,
        machineType: machine.machineType,
      },
    });
    clientsByPat.set(pat, client);
    return client;
  }

  function resolveClient(request: Request): { client: QoderClient; pat: string } | Response {
    const pat = extractBearerToken(request);
    if (pat) return { client: getClient(pat), pat };
    return errorResponse(
      "Missing Authorization header. Send `Authorization: Bearer <qoder-pat>`.",
      401,
      "authentication_error",
      "missing_api_key",
    );
  }

  // ── Per-PAT daily rate limits (file-backed) ──
  const RATE_LIMITED_MODELS: Record<string, number> = {
    qmodel_latest: 200,
  };
  const rateLimitPath = asNonEmptyString(Bun.env.QODER_RATE_LIMIT_PATH)
    || path.join(import.meta.dir, "rate-limits.json");

  let requestCounts: Record<string, number> = {};
  try {
    requestCounts = JSON.parse(fs.readFileSync(rateLimitPath, "utf8")) as Record<string, number>;
  } catch {
    // First run or corrupt file — start fresh.
  }
  let dirty = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushCounts(): void {
    if (!dirty) return;
    dirty = false;
    const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    for (const key of Object.keys(requestCounts)) {
      const day = key.split("|")[2];
      if (day && day < cutoff) delete requestCounts[key];
    }
    fs.writeFileSync(rateLimitPath, JSON.stringify(requestCounts, null, 2));
  }

  function scheduleFlush(): void {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushCounts();
    }, 5_000);
  }
  process.on("exit", flushCounts);

  function checkRateLimit(pat: string, model: string): Response | null {
    const limit = RATE_LIMITED_MODELS[model];
    if (!limit) return null;
    const day = new Date().toISOString().slice(0, 10);
    const key = `${pat}|${model}|${day}`;
    const count = requestCounts[key] ?? 0;
    if (count >= limit) {
      return jsonResponse(
        {
          error: {
            message: `Rate limit exceeded for model ${model}: ${limit} requests per day.`,
            type: "requests",
            code: "rate_limit_exceeded",
          },
        },
        { status: 429, headers: { "retry-after": "86400" } },
      );
    }
    requestCounts[key] = count + 1;
    scheduleFlush();
    return null;
  }

  const debug = Bun.env.QODER_DEBUG === "1" || Bun.env.QODER_DEBUG === "true";
  const log = debug ? console.log.bind(console) : () => {};
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return jsonResponse({ ok: true });
    }

    const resolved = resolveClient(request);
    if (resolved instanceof Response) return resolved;
    const { client, pat } = resolved;

    if (request.method === "GET" && url.pathname === "/v1/models") {
      try {
        const models = await client.fetchModels();
        return jsonResponse({ object: "list", data: models });
      } catch {
        return jsonResponse({ object: "list", data: createModelsPayload().data });
      }
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return errorResponse("Request body must be valid JSON.", 400);
      }

      const parsed = parseRequestBody(body);
      if (parsed instanceof Response) return parsed;
      if (!resolveModel(parsed.model)) {
        return errorResponse(
          `Unknown model: ${parsed.model}. Available models: ${QODER_MODELS.map((m) => m.id).join(", ")}`,
          400,
          "invalid_request_error",
          "model_not_found",
        );
      }

      const modelDef = resolveModel(parsed.model)!;
      const rateLimited = checkRateLimit(pat, modelDef.upstream);
      if (rateLimited) return rateLimited;

      log(`\n${"=".repeat(80)}`);
      log(`[REQ] model=${parsed.model} stream=${!!parsed.stream} tools=${parsed.tools?.length ?? 0}`);
      log("[REQ] Messages:");
      for (const msg of parsed.messages) {
        const content = msg.content == null ? "(null)" : typeof msg.content === "string" ? msg.content.slice(0, 500) : JSON.stringify(msg.content).slice(0, 500);
        log(`  [${msg.role}] ${content}`);
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            log(`    → tool_call: ${tc.function.name}(${tc.function.arguments.slice(0, 200)})`);
          }
        }
        if (msg.tool_call_id) {
          log(`    → tool_result for: ${msg.tool_call_id}`);
        }
      }

      try {
        if (parsed.stream) {
          const resp = await handleChatCompletionStream(client, parsed, request.signal);
          if (debug) {
            const [logStream, clientStream] = resp.body!.tee();
            const reader = logStream.getReader();
            const decoder = new TextDecoder();
            let accumulated = "";
            (async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  accumulated += decoder.decode(value, { stream: true });
                }
                log("[RES] Stream complete:");
                for (const line of accumulated.split("\n")) {
                  if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
                  try {
                    const chunk = JSON.parse(line.slice(6));
                    const delta = chunk.choices?.[0]?.delta;
                    if (delta?.content) log(`  [content] ${delta.content.slice(0, 200)}`);
                    if (delta?.tool_calls) {
                      for (const tc of delta.tool_calls) {
                        log(`  [tool_call] ${tc.function?.name}(${tc.function?.arguments?.slice(0, 200) ?? ""})`);
                      }
                    }
                    if (chunk.choices?.[0]?.finish_reason) log(`  [finish] ${chunk.choices[0].finish_reason}`);
                    if (chunk.usage) log(`  [usage] ${JSON.stringify(chunk.usage)}`);
                  } catch {}
                }
                log("=".repeat(80));
              } catch {}
            })();
            return new Response(clientStream, { status: resp.status, headers: resp.headers });
          }
          return resp;
        }

        const resp = await handleChatCompletionJson(client, parsed, request.signal);
        if (debug) {
          const respBody = await resp.clone().json() as any;
          log("[RES] Response:");
          const msg = respBody.choices?.[0]?.message;
          if (msg?.content) log(`  [content] ${msg.content.slice(0, 500)}`);
          if (msg?.tool_calls) {
            for (const tc of msg.tool_calls) {
              log(`  [tool_call] ${tc.function?.name}(${tc.function?.arguments?.slice(0, 200) ?? ""})`);
            }
          }
          log(`  [finish] ${respBody.choices?.[0]?.finish_reason}`);
          log(`  [usage] ${JSON.stringify(respBody.usage)}`);
          log("=".repeat(80));
        }
        return resp;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[ERR] ${msg}`);
        return errorResponse(msg, 502, "bad_gateway", "qoder_upstream_error");
      }
    }

    return errorResponse("Not found.", 404, "invalid_request_error", "not_found");
  };
}

export function startProxyServer(config: ProxyConfig = loadConfig()) {
  return Bun.serve({
    hostname: config.host,
    port: config.port,
    idleTimeout: 120,
    fetch: createProxyHandler(config),
  });
}

if (import.meta.main) {
  const server = startProxyServer();
  console.log(`Qoder OpenAI proxy listening on http://${server.hostname}:${server.port}`);
  console.log(`Models: ${QODER_MODELS.map((model) => model.id).join(", ")}`);
}
