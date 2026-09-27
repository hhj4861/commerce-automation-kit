"""Run against an isolated CI Compose stack, never a production gateway."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gateway import Client, ApiError, ROOT, read_env, provision

base = "http://127.0.0.1:4100"
for app, own, other in (("hanmadi", "hanmadi-chat", "replay-video-planner"),
                        ("replay", "replay-video-planner", "hanmadi-chat")):
    target = provision(app, 1, base)
    before = target.read_bytes()
    provision(app, 1, base)
    assert target.read_bytes() == before, "Provision must preserve existing keys"
    client = Client(base, read_env(target)["LITELLM_API_KEY"])
    models = {m["id"] for m in client.call("/v1/models")["data"]}
    assert own in models and other not in models, "Cross-app model discovery leaked"
    result = client.call("/v1/chat/completions", {"model": own, "messages": [{"role": "user", "content": "CI test"}], "max_tokens": 8})
    assert result["choices"][0]["message"]["content"] == "CI mock response"
    for path, payload in (("/v1/chat/completions", {"model": other, "messages": [{"role": "user", "content": "CI test"}]}),
                          ("/key/generate", {"models": [own]})):
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
