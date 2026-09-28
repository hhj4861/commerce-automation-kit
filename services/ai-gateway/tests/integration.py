"""Run against an isolated CI Compose stack, never a production gateway."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gateway import Client, ApiError, ROOT, read_env, provision

base = "http://127.0.0.1:4100"
chat_models = {"hanmadi": "hanmadi-chat", "replay": "replay-video-planner", "festa": "festa-travel"}
for app, own in chat_models.items():
    others = set(chat_models.values()) - {own}
    target = provision(app, 1, base)
    before = target.read_bytes()
    provision(app, 1, base)
    assert target.read_bytes() == before, "Provision must preserve existing keys"
    client = Client(base, read_env(target)["LITELLM_API_KEY"])
    models = {m["id"] for m in client.call("/v1/models")["data"]}
    assert own in models and not (others & models), "Cross-app model discovery leaked"
    result = client.call("/v1/chat/completions", {"model": own, "messages": [{"role": "user", "content": "CI test"}], "max_tokens": 8})
    assert result["choices"][0]["message"]["content"] == "CI mock response"
    forbidden = [("/v1/chat/completions", {"model": other, "messages": [{"role": "user", "content": "CI test"}]}) for other in others]
    forbidden.append(("/key/generate", {"models": [own]}))
    for path, payload in forbidden:
        try:
            client.call(path, payload)
            raise AssertionError("Cross-app/admin request was not denied")
        except ApiError as error:
            assert error.status in (401, 403), (path, error.status)
    print(app, "own-model success, cross-app/admin denied, repeat issuance unchanged")
try:
    Client(base, "sk-invalid").call("/v1/models")
    raise AssertionError("Invalid key accepted")
except ApiError as error:
    assert error.status in (401, 403)
print("Gateway integration PASS (mock provider, real LiteLLM + PostgreSQL)")
