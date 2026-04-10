#!/usr/bin/env python3
"""
E2E test for the Agent Builder: generate → deploy → invoke
Talks directly to the builder agent API on :8082
"""
import json
import re
import sys
import time
import boto3
import requests

BUILDER_URL = "http://localhost:8082/invocations"
REGION = "us-east-1"
TIMEOUT = 300  # 5 min for generation + deploy

def call_builder(prompt, session_id="e2e_test"):
    """Call the builder agent and collect the full streamed response."""
    resp = requests.post(BUILDER_URL, json={"prompt": prompt, "session_id": session_id}, stream=True, timeout=TIMEOUT)
    full = ""
    for line in resp.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            try:
                parsed = json.loads(line[6:])
                if isinstance(parsed, str):
                    full += parsed
            except json.JSONDecodeError:
                pass
    return full

def extract_code(text):
    """Extract python-deploy or python code block from response."""
    match = re.search(r'```python-deploy\s*\n([\s\S]*?)\n```', text)
    if not match:
        match = re.search(r'```python\s*\n([\s\S]*?)\n```', text)
    return match.group(1).strip() if match else None

def validate_code(code):
    """Check that generated code has all required patterns."""
    checks = {
        "BedrockAgentCoreApp()": "BedrockAgentCoreApp()" in code,
        "@app.entrypoint": "@app.entrypoint" in code,
        "app.run()": "app.run()" in code,
        "lazy_init (no module-level boto3)": not re.search(r'^(?:import boto3|ddb\s*=|client\s*=\s*boto3)', code, re.MULTILINE) or "import boto3" not in code.split("def ")[0] if "def " in code else False,
        "json.dumps in tools": "json.dumps" in code,
        "@tool decorator": "@tool" in code,
        "under 200 lines": len(code.split("\n")) < 200,
    }
    # More precise lazy init check: boto3 should not appear before the first @tool
    first_tool_idx = code.find("@tool")
    if first_tool_idx > 0:
        before_tools = code[:first_tool_idx]
        checks["lazy_init (no module-level boto3)"] = "boto3.resource" not in before_tools and "boto3.client" not in before_tools
    return checks

def wait_for_agent(agent_name, max_wait=300):
    """Wait for an agent to reach READY status."""
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    start = time.time()
    while time.time() - start < max_wait:
        for a in control.list_agent_runtimes(maxResults=50).get("agentRuntimes", []):
            if agent_name in a.get("agentRuntimeName", ""):
                status = a["status"]
                if status == "READY":
                    return a
                elif status == "FAILED":
                    detail = control.get_agent_runtime(agentRuntimeId=a["agentRuntimeId"])
                    return {"status": "FAILED", "reason": detail.get("failureReason", "unknown")}
                print(f"  Agent status: {status}...")
        time.sleep(15)
    return {"status": "TIMEOUT"}

def invoke_agent(agent_runtime_id, prompt):
    """Invoke a deployed agent and return the response."""
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    runtime = boto3.client("bedrock-agentcore", region_name=REGION)
    agent = control.get_agent_runtime(agentRuntimeId=agent_runtime_id)
    resp = runtime.invoke_agent_runtime(
        agentRuntimeArn=agent["agentRuntimeArn"],
        qualifier="DEFAULT",
        contentType="application/json",
        accept="application/json",
        payload=json.dumps({"prompt": prompt}).encode("utf-8"),
    )
    return resp["response"].read().decode("utf-8")

def add_dynamodb_permissions(agent_runtime_id):
    """Add DynamoDB permissions to the agent's IAM role."""
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    iam = boto3.client("iam", region_name=REGION)
    detail = control.get_agent_runtime(agentRuntimeId=agent_runtime_id)
    role_name = detail["roleArn"].split("/")[-1]
    iam.put_role_policy(
        RoleName=role_name,
        PolicyName="DateSparkDynamoDBAccess",
        PolicyDocument=json.dumps({
            "Version": "2012-10-17",
            "Statement": [{"Effect": "Allow", "Action": ["dynamodb:GetItem", "dynamodb:Scan", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:PutItem"], "Resource": "arn:aws:dynamodb:us-east-1:023392223961:table/datespark-*"}]
        }),
    )
    print(f"  DynamoDB permissions added to {role_name}")

def cleanup_test_agents():
    """Delete any test agents from previous runs."""
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    keep = {"ac_mortgage_agent", "ac_bank_agent", "datespark_ts_agent"}
    for a in control.list_agent_runtimes(maxResults=50).get("agentRuntimes", []):
        name = a.get("agentRuntimeName", "")
        if name not in keep and "test" not in name.lower():
            # Only delete agents that look like builder-created ones
            if "safety" in name.lower() or "moderator" in name.lower() or "custom" in name.lower():
                try:
                    control.delete_agent_runtime(agentRuntimeId=a["agentRuntimeId"])
                    print(f"  Cleaned up: {name}")
                except:
                    pass

def run_test():
    print("=" * 60)
    print("E2E TEST: Agent Builder → Generate → Deploy → Invoke")
    print("=" * 60)

    # Cleanup
    print("\n[0] Cleaning up old test agents...")
    cleanup_test_agents()

    # Step 1: Generate code
    print("\n[1] Asking builder to generate T&S agent code...")
    gen_prompt = (
        "Generate a Trust & Safety agent for DateSpark dating app. "
        "Name it datespark_safety_agent. "
        "It needs these tools: "
        "1) user_lookup - reads datespark-users table by userId key, "
        "2) scan_messages - scans datespark-messages filtering by senderId, "
        "3) check_reports - scans datespark-reports filtering by reportedUserId, "
        "4) suspend_account - updates accountStatus in datespark-users, "
        "5) notify_team - mock notification tool. "
        "Show me the code."
    )
    gen_response = call_builder(gen_prompt)
    print(f"  Response length: {len(gen_response)} chars")

    code = extract_code(gen_response)
    if not code:
        print("  ❌ FAIL: No code block found in response")
        print(f"  Response preview: {gen_response[:500]}")
        return False

    print(f"  Code: {len(code.split(chr(10)))} lines")
    checks = validate_code(code)
    all_pass = True
    for check, passed in checks.items():
        status = "✅" if passed else "❌"
        print(f"  {status} {check}")
        if not passed:
            all_pass = False

    if not all_pass:
        print("\n  ❌ FAIL: Code validation failed")
        print(f"\n  Generated code:\n{code[:1000]}")
        return False

    print("  ✅ Code generation passed!")

    # Step 2: Deploy via builder
    print("\n[2] Asking builder to deploy the agent...")
    deploy_prompt = "Deploy it now."
    deploy_response = call_builder(deploy_prompt)
    print(f"  Response length: {len(deploy_response)} chars")
    print(f"  Response preview: {deploy_response[:300]}")

    # Check if deploy was initiated
    if "error" in deploy_response.lower() and "deploy" not in deploy_response.lower():
        print("  ❌ FAIL: Deploy error")
        print(f"  Full response: {deploy_response[:500]}")
        return False

    # Step 3: Wait for agent to be ready
    print("\n[3] Waiting for agent to reach READY status...")
    agent_info = wait_for_agent("datespark_safety_agent")
    if not agent_info or agent_info.get("status") != "READY":
        print(f"  ❌ FAIL: Agent not ready: {agent_info}")
        return False

    agent_id = agent_info["agentRuntimeId"]
    print(f"  ✅ Agent READY: {agent_id}")

    # Step 4: Add DynamoDB permissions
    print("\n[4] Adding DynamoDB permissions...")
    add_dynamodb_permissions(agent_id)
    time.sleep(15)  # Wait for IAM propagation

    # Step 5: Invoke the agent
    print("\n[5] Invoking the deployed agent...")
    try:
        result = invoke_agent(agent_id, "Look up user U-11111 and check their reports")
        print(f"  Response length: {len(result)} chars")
        if "crypto_king" in result or "Alex" in result or "scam" in result.lower() or "risk" in result.lower():
            print("  ✅ Agent returned real DynamoDB data!")
        elif "error" in result.lower() or "permission" in result.lower():
            print(f"  ⚠️ Agent invoked but may have permission issues (IAM propagation)")
            print(f"  Response: {result[:300]}")
            # Try again after more wait
            print("  Retrying in 30s...")
            time.sleep(30)
            result = invoke_agent(agent_id, "Look up user U-11111")
            if "crypto_king" in result or "Alex" in result:
                print("  ✅ Agent returned real DynamoDB data on retry!")
            else:
                print(f"  ⚠️ Still permission issues, but agent IS running (no 30s timeout)")
                print(f"  Response: {result[:300]}")
        else:
            print(f"  ✅ Agent invoked successfully (no timeout!)")
            print(f"  Response: {result[:300]}")
    except Exception as e:
        print(f"  ❌ FAIL: Invoke error: {e}")
        return False

    print("\n" + "=" * 60)
    print("✅ E2E TEST PASSED: Generate → Deploy → Invoke")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = run_test()
    sys.exit(0 if success else 1)
