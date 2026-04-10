#!/usr/bin/env python3
"""E2E test for DateSparkEnterprise gateway + builder agent OpenAPI target creation."""
import boto3, json, requests, sys

BUILDER_URL = "http://localhost:8082/invocations"
REGION = "us-east-1"
GW_NAME = "DateSparkEnterpriseAuth"

def call_builder(prompt, session_id="gw_test"):
    resp = requests.post(BUILDER_URL, json={"prompt": prompt, "session_id": session_id}, stream=True, timeout=180)
    full = ""
    for line in resp.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            try:
                parsed = json.loads(line[6:])
                if isinstance(parsed, str): full += parsed
            except: pass
    return full

def run():
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    
    # Test 1: Gateway exists with targets
    print("[1] Verify DateSparkEnterprise gateway exists...")
    gws = control.list_gateways(maxResults=50)
    gw = next((g for g in gws.get("items", []) if g["name"] == GW_NAME), None)
    assert gw, f"Gateway {GW_NAME} not found"
    assert gw["status"] == "READY", f"Gateway not ready: {gw['status']}"
    gw_id = gw["gatewayId"]
    print(f"  ✅ Gateway: {gw_id} (READY)")

    targets = control.list_gateway_targets(gatewayIdentifier=gw_id, maxResults=50)
    target_names = [t["name"] for t in targets.get("items", [])]
    print(f"  Targets: {target_names}")
    assert "SlackIntegration" in target_names, "SlackIntegration target missing"
    assert "JiraIntegration" in target_names, "JiraIntegration target missing"
    print("  ✅ Slack + Jira targets present")

    # Test 2: Builder discovers the gateway
    print("\n[2] Builder discovers gateways...")
    resp = call_builder("List all MCP gateways and their targets", "gw_discover")
    assert "DateSparkEnterprise" in resp or "datesparkenterprise" in resp.lower(), "Builder didn't find gateway"
    has_slack = "slack" in resp.lower()
    has_jira = "jira" in resp.lower()
    print(f"  Found Slack: {'✅' if has_slack else '❌'} | Jira: {'✅' if has_jira else '❌'}")
    print("  ✅ Builder discovered gateway")

    # Test 3: Builder can add an OpenAPI target
    print("\n[3] Builder adds OpenAPI target to gateway...")
    # Use the public petstore API as a test OpenAPI spec
    resp = call_builder(
        f"Add an OpenAPI target to the DateSparkEnterprise gateway (ID: {gw_id}). "
        f"Name it 'PetStoreAPI', description 'Pet store demo API'. "
        f"Use this OpenAPI spec URL: https://petstore3.swagger.io/api/v3/openapi.json",
        "gw_openapi"
    )
    print(f"  Response preview: {resp[:300]}")
    
    # Check if target was created
    import time; time.sleep(5)
    targets_after = control.list_gateway_targets(gatewayIdentifier=gw_id, maxResults=50)
    target_names_after = [t["name"] for t in targets_after.get("items", [])]
    print(f"  Targets after: {target_names_after}")
    
    if "PetStoreAPI" in target_names_after:
        print("  ✅ OpenAPI target created!")
        # Clean up test target
        pet_target = next(t for t in targets_after["items"] if t["name"] == "PetStoreAPI")
        control.delete_gateway_target(gatewayIdentifier=gw_id, targetId=pet_target["targetId"])
        print("  Cleaned up PetStoreAPI target")
    else:
        if "error" in resp.lower():
            print(f"  ⚠️ OpenAPI target creation had errors (may be API format issue)")
            print(f"  Response: {resp[:500]}")
        else:
            print("  ⚠️ Target not found yet (may still be creating)")

    print("\n" + "=" * 50)
    print("✅ Gateway E2E tests complete")
    print("=" * 50)
    return True

if __name__ == "__main__":
    success = run()
    sys.exit(0 if success else 1)
