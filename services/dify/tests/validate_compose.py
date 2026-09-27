"""Check the fully merged configuration without printing its secret values."""
import json
import sys

config = json.load(sys.stdin)
services = config["services"]
for name, service in services.items():
    for port in service.get("ports", []):
        assert name == "nginx", f"Unexpected published service: {name}"
        assert port["host_ip"] == "127.0.0.1" and str(port["published"]) == "4180"
assert set(services["plugin_daemon"]["networks"]) == {"ssrf_proxy_network", "default", "gateway"}
assert services["plugin_daemon"]["environment"]["FORCE_VERIFYING_SIGNATURE"] == "true"
assert config["networks"]["gateway"]["external"] is True
print("Merged Compose: loopback UI only, plugin bridge, signature verification PASS")
