import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { startProxyServer, type ProxyConfig } from "./qoder";

const JOB_TOKEN_URL = "https://center.qoder.sh/algo/api/v3/user/jobToken?Encode=1";
const CHAT_URL = "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1";

const realFetch = globalThis.fetch;
let tempDir = "";
let templatePath = "";
let server: { stop: (closeActiveConnections?: boolean) => Promise<void>; url: URL } | undefined;

const MODEL_LIST_URL = "https://api2.qoder.sh/algo/api/v2/model/list?Encode=1";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qoder-proxy-test-"));
  templatePath = path.join(tempDir, "qoder-baseprompt.json");
  fs.writeFileSync(
    templatePath,
    JSON.stringify({
      parameters: {},
      messages: [{ role: "system", content: "Base prompt", contents: [{ type: "text", text: "Base prompt" }] }],
    }),
    "utf8",
  );
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  if (server) {
    await server.stop(true);
    server = undefined;
  }
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeConfig(): ProxyConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    templatePath,
    urls: {
      jobTokenUrl: JOB_TOKEN_URL,
      chatUrl: CHAT_URL,
      modelListUrl: MODEL_LIST_URL,
    },
    fallbackPat: "pat_test",
    tokens: {
      personalToken: "pat_test",
      machineId: "machine-id",
      machineToken: "machine-token",
      machineType: "machine-type",
    },
  };
}

function qoderEvent(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify({ body: JSON.stringify(payload) })}\n\n`;
}

test("GET /v1/models returns Qoder model ids", async () => {
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1:")) {
        return realFetch(input as any, init as any);
      }
      if (url === JOB_TOKEN_URL) {
        return Response.json({
          id: "user-123",
          name: "Alex",
          securityOauthToken: "oauth-token",
          refreshToken: "refresh-token",
          expireTime: Date.now() + 3_600_000,
          userType: "personal_standard",
        });
      }
      if (url === MODEL_LIST_URL) {
        return Response.json({
          chat: [
            { key: "auto", display_name: "Auto", enable: true, is_vl: true, is_reasoning: false, max_input_tokens: 180_000 },
            { key: "deepseek-v4-pro", display_name: "DeepSeek V4 Pro", enable: true, is_vl: true, is_reasoning: true, max_input_tokens: 180_000 },
            { key: "disabled-model", display_name: "Disabled", enable: false, max_input_tokens: 128_000 },
          ],
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    { preconnect: realFetch.preconnect },
  ) as typeof fetch;

  server = startProxyServer(makeConfig());
  const response = await realFetch(new URL("/v1/models", server.url));
  expect(response.status).toBe(200);

  const body = await response.json() as { object: string; data: Array<{ id: string }> };
  expect(body.object).toBe("list");
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.data.map((entry) => entry.id)).toContain("auto");
  expect(body.data.map((entry) => entry.id)).toContain("deepseek-v4-pro");
  expect(body.data.map((entry) => entry.id)).not.toContain("disabled-model");
});

test("POST /v1/chat/completions returns OpenAI-compatible JSON", async () => {
  let chatBody: string | undefined;

  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1:")) {
        return realFetch(input as any, init as any);
      }
      if (url === JOB_TOKEN_URL) {
        return Response.json({
          id: "user-123",
          name: "Alex",
          securityOauthToken: "oauth-token",
          refreshToken: "refresh-token",
          expireTime: Date.now() + 3_600_000,
          userType: "personal_standard",
        });
      }
      if (url === CHAT_URL) {
        chatBody = typeof init?.body === "string" ? init.body : undefined;
        return new Response(
          qoderEvent({ choices: [{ delta: { role: "assistant" } }] })
            + qoderEvent({ choices: [{ delta: { content: "Hello" } }] })
            + qoderEvent({ choices: [{ delta: { content: " world" }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 } }),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    { preconnect: realFetch.preconnect },
  ) as typeof fetch;

  server = startProxyServer(makeConfig());
  const response = await realFetch(new URL("/v1/chat/completions", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "qd-Auto",
      messages: [{ role: "user", content: "Say hello" }],
    }),
  });

  expect(response.status).toBe(200);
  const body = await response.json() as {
    object: string;
    model: string;
    choices: Array<{
      message: { role: string; content: string };
      finish_reason: string;
    }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  expect(body.object).toBe("chat.completion");
  expect(body.model).toBe("qd-Auto");
  expect(body.choices).toHaveLength(1);
  const choice = body.choices[0]!;
  expect(choice.message.role).toBe("assistant");
  expect(choice.message.content).toBe("Hello world");
  expect(choice.finish_reason).toBe("stop");
  expect(body.usage).toEqual({ prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 });
  expect(chatBody).toBeString();
});

test("POST /v1/chat/completions streams OpenAI-compatible SSE", async () => {
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1:")) {
        return realFetch(input as any, init as any);
      }
      if (url === JOB_TOKEN_URL) {
        return Response.json({
          id: "user-123",
          name: "Alex",
          securityOauthToken: "oauth-token",
          refreshToken: "refresh-token",
          expireTime: Date.now() + 3_600_000,
          userType: "personal_standard",
        });
      }
      if (url === CHAT_URL) {
        return new Response(
          qoderEvent({ choices: [{ delta: { role: "assistant" } }] })
            + qoderEvent({ choices: [{ delta: { content: "Hello" } }] })
            + qoderEvent({ choices: [{ delta: { tool_calls: [{ index: 0, id: "tool-1", function: { name: "lookup", arguments: '{"city":"Paris"}' } }] } }] })
            + qoderEvent({ choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 7, total_tokens: 27 } }),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    { preconnect: realFetch.preconnect },
  ) as typeof fetch;

  server = startProxyServer(makeConfig());
  const response = await realFetch(new URL("/v1/chat/completions", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "qd-Auto",
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: "Need a tool" }],
    }),
  });

  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).toContain('"object":"chat.completion.chunk"');
  expect(text).toContain('"role":"assistant"');
  expect(text).toContain('"content":"Hello"');
  expect(text).toContain('"finish_reason":"tool_calls"');
  expect(text).toContain('"tool_calls"');
  expect(text).toContain('"usage":{"prompt_tokens":20,"completion_tokens":7,"total_tokens":27}');
  expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
});

test("POST /v1/chat/completions uses per-request PAT from Authorization header", async () => {
  let capturedBody: string | undefined;

  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1:")) {
        return realFetch(input as any, init as any);
      }
      if (url === JOB_TOKEN_URL) {
        return Response.json({
          id: "user-per-req",
          name: "PerReqUser",
          securityOauthToken: "per-req-oauth",
          refreshToken: "per-req-refresh",
          expireTime: Date.now() + 3_600_000,
          userType: "personal_standard",
        });
      }
      if (url === CHAT_URL) {
        capturedBody = typeof init?.body === "string" ? init.body : undefined;
        return new Response(
          qoderEvent({ choices: [{ delta: { role: "assistant" } }] })
            + qoderEvent({ choices: [{ delta: { content: "per-request ok" } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    { preconnect: realFetch.preconnect },
  ) as typeof fetch;

  server = startProxyServer(makeConfig());
  const response = await realFetch(new URL("/v1/chat/completions", server.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer user-pat-abc123",
    },
    body: JSON.stringify({
      model: "qd-Auto",
      messages: [{ role: "user", content: "Check PAT" }],
    }),
  });

  expect(response.status).toBe(200);
  const body = await response.json() as {
    object: string;
    model: string;
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  expect(body.object).toBe("chat.completion");
  expect(body.choices).toHaveLength(1);
  expect(body.choices[0]!.message.content).toBe("per-request ok");
  expect(capturedBody).toBeString();
});

test("GET /v1/models returns 401 without auth header when no fallback PAT", async () => {
  server = startProxyServer({ ...makeConfig(), fallbackPat: undefined });
  const response = await realFetch(new URL("/v1/models", server.url));
  expect(response.status).toBe(401);
  const body = await response.json() as { error: { type: string; code: string } };
  expect(body.error.type).toBe("authentication_error");
  expect(body.error.code).toBe("missing_api_key");
});

test("rate limit blocks qmodel_latest after 200 requests per day", async () => {
  let upstreamHits = 0;

  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1:")) {
        return realFetch(input as any, init as any);
      }
      if (url === JOB_TOKEN_URL) {
        return Response.json({
          id: "user-rl",
          name: "RL",
          securityOauthToken: "rl-oauth",
          refreshToken: "rl-refresh",
          expireTime: Date.now() + 3_600_000,
          userType: "personal_standard",
        });
      }
      if (url === CHAT_URL) {
        upstreamHits++;
        return new Response(
          qoderEvent({ choices: [{ delta: { role: "assistant" } }] })
            + qoderEvent({ choices: [{ delta: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    { preconnect: realFetch.preconnect },
  ) as typeof fetch;

  server = startProxyServer(makeConfig());
  const url = new URL("/v1/chat/completions", server.url);

  // qmodel_latest is the upstream key for qd-Qwen3.7-Max
  const body = JSON.stringify({
    model: "qd-Qwen3.7-Max",
    messages: [{ role: "user", content: "ping" }],
  });

  let okCount = 0;
  let rateLimitedCount = 0;
  for (let i = 0; i < 210; i++) {
    const res = await realFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer rl-pat",
      },
      body,
    });
    if (res.status === 200) okCount++;
    if (res.status === 429) rateLimitedCount++;
  }

  expect(okCount).toBe(200);
  expect(rateLimitedCount).toBe(10);
  expect(upstreamHits).toBe(200);
});
