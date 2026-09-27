"""Offline regression against the pinned LiteLLM SDK; never logs in."""
import asyncio
import importlib.util
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

temporary = tempfile.TemporaryDirectory()
os.environ["CHATGPT_TOKEN_DIR"] = temporary.name
os.environ["CHATGPT_AUTH_FILE"] = "auth.json"

path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "subscription_runtime.py"
spec = importlib.util.spec_from_file_location("runtime", path)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
runtime.noninteractive_auth()
runtime.repair_subscription_bridge()
runtime.repair_subscription_bridge()  # Idempotent installation.

from litellm.completion_extras.litellm_responses_transformation.handler import ResponsesToCompletionBridgeHandler
from litellm.llms.chatgpt.authenticator import Authenticator

try:
    Authenticator()._login_device_code()
except RuntimeError:
    pass
else:
    raise AssertionError("Inference started an interactive device login")


class Stream:
    custom_llm_provider = "chatgpt"
    _hidden_params = {"test_header": "preserved"}

    def __init__(self, events):
        self.events = iter(events)
        self.completed_response = SimpleNamespace(response=None)

    def __iter__(self):
        return self

    def __next__(self):
        return next(self.events)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self)
        except StopIteration:
            raise StopAsyncIteration


item = {"id": "msg_test", "type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": "OK", "annotations": []}]}
terminal = {"type": "response.completed", "response": {"id": "resp_test", "object": "response", "created_at": 1, "model": "gpt-test", "status": "completed", "output": []}}
events = [{"type": "response.output_item.done", "output_index": 0, "item": item}, terminal]
bridge = ResponsesToCompletionBridgeHandler()
for result in (bridge._collect_response_from_stream(Stream(events)), asyncio.run(bridge._collect_response_from_stream_async(Stream(events)))):
    assert result.model_dump()["output"][0]["content"][0]["text"] == "OK"
    assert result._hidden_params["test_header"] == "preserved"

for ending in ([], [{"type": "response.failed", "error": {"message": "synthetic failure"}}]):
    try:
        bridge._collect_response_from_stream(Stream(events[:1] + ending))
    except RuntimeError:
        pass
    else:
        raise AssertionError("Incomplete stream accepted")

foreign = Stream([])
foreign.custom_llm_provider = "openai"
foreign.completed_response.response = {**terminal["response"], "output": [item]}
assert bridge._collect_response_from_stream(foreign).model_dump()["output"][0]["id"] == "msg_test"

temporary.cleanup()

print("PASS pinned SDK: noninteractive guard, sync/async empty terminal recovery, incomplete rejection, metadata preservation")
