# qoder-proxy-v2

OpenAI-compatible standalone proxy for Qoder.

## Install

```bash
bun install
```

## Auth

Every request authenticates with a Qoder PAT via the standard OpenAI header:

```
Authorization: Bearer <qoder-pat>
```

Each unique PAT gets its own cached client with fresh auth tokens.

Optionally set `QODER_PERSONAL_TOKEN` as a fallback so requests without an
`Authorization` header still work (useful for single-user local setups).

## Optional environment

- `QODER_PERSONAL_TOKEN` — fallback PAT for requests without `Authorization`
- `HOST` — default `127.0.0.1`
- `PORT` — default `3000`
- `QODER_BASEPROMPT_PATH` — default `./qoder-baseprompt.json`
- `QODER_JOB_TOKEN_URL`
- `QODER_CHAT_URL`
- `QODER_MODEL_LIST_URL`

## Run

```bash
bun run start
```

## OpenAI-compatible endpoints

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/chat/completions`

## Example

```bash
curl http://127.0.0.1:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_QODER_PAT' \
  -d '{
    "model": "qd-Auto",
    "messages": [
      {"role": "user", "content": "Write a haiku about proxies"}
    ]
  }'
```
