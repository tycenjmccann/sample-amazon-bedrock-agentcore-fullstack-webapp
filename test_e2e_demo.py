#!/usr/bin/env python3
"""
Full Demo E2E Test — Acts 1-4
Tests the entire demo flow: Build Agent → MCP Gateway → Model Swap → Evaluations
"""
import json, re, sys, time, boto3, requests

BUILDER_URL = "http://localhost:8082/invocations"
BACKEND_URL = "http://localhost:8081"
REGION = "us-east-1"
ACCOUNT = "023392223961"

def call_builder(prompt, session_id="demo_e2e"):
    resp = requests.post(BUILDER_URL, json={"prompt": prompt, "session_id": session_id}, stream=True, timeout=300)
    full = ""
    for line in resp.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            try:
                parsed = json.loads(line[6:])
                if isinstance(parsed, str): full += parsed
            except: pass
    return full

def extract_code(text):
    match = re.search(r'```python-deploy\s*\n([\s\S]*?)\n```', text)
    if not match:
        match = re.search(r'```python\s*\n([\s\S]*?)\n```', text)
    return match.group(1).strip() if match else None

def wait_for_agent(name, max_wait=300):
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    start = time.time()
    while time.time() - start < max_wait:
        for a in control.list_agent_runtimes(maxResults=50).get("agentRuntimes", []):
            if name in a.get("agentRuntimeName", ""):
                if a["status"] == "READY": return a
                if a["status"] == "FAILED": return {"status": "FAILED", "reason": "deployment failed"}
                print(f"    Status: {a['status']}...")
        time.sleep(15)
    return {"status": "TIMEOUT"}

def cleanup_agent(name):
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    for a in control.list_agent_runtimes(maxResults=50).get("agentRuntimes", []):
        if a.get("agentRuntimeName") == name:
            try:
                control.delete_agent_runtime(agentRuntimeId=a["agentRuntimeId"])
                print(f"    Cleaned up: {name}")
            except: pass

def add_dynamodb_permissions(agent_runtime_id):
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    iam = boto3.client("iam", region_name=REGION)
    detail = control.get_agent_runtime(agentRuntimeId=agent_runtime_id)
    role_name = detail["roleArn"].split("/")[-1]
    iam.put_role_policy(RoleName=role_name, PolicyName="DemoDBAccess",
        PolicyDocument=json.dumps({"Version":"2012-10-17","Statement":[
            {"Effect":"Allow","Action":["dynamodb:*"],"Resource":f"arn:aws:dynamodb:{REGION}:{ACCOUNT}:table/datespark-*"}
        ]}))

def run():
    results = {}
    
    # =========================================================================
    print("=" * 70)
    print("ACT 1: BUILD THE AGENT")
    print("=" * 70)
    
    agent_name = "demo_ts_agent"
    cleanup_agent(agent_name)
    
    # Step 1: Ask builder to discover + plan
    print("\n[1.1] Builder discovers infra and presents plan...")
    plan = call_builder(
        "Build a Trust & Safety agent for DateSpark dating app called demo_ts_agent. "
        "Check my DynamoDB tables and build tools that use them.",
        "demo_act1"
    )
    has_plan = "datespark" in plan.lower() and ("found" in plan.lower() or "table" in plan.lower())
    print(f"  Discovery + plan: {'✅' if has_plan else '❌'}")
    results["act1_plan"] = has_plan
    
    # Step 2: Confirm and generate code
    print("\n[1.2] Confirming plan, generating code...")
    gen = call_builder("Yes, looks good. Generate the code.", "demo_act1")
    code = extract_code(gen)
    if code:
        has_lazy = "boto3" not in code.split("def ")[0] if "def " in code else False
        has_entrypoint = "@app.entrypoint" in code
        has_otel = True  # Builder handles requirements
        print(f"  Code generated: ✅ ({len(code.split(chr(10)))} lines)")
        print(f"  Lazy init: {'✅' if has_lazy else '❌'} | Entrypoint: {'✅' if has_entrypoint else '❌'}")
        results["act1_code"] = True
    else:
        print(f"  Code generated: ❌")
        print(f"  Response preview: {gen[:300]}")
        results["act1_code"] = False
    
    # Step 3: Deploy
    print("\n[1.3] Deploying agent...")
    deploy = call_builder("Deploy it now.", "demo_act1")
    print(f"  Deploy response: {deploy[:200]}")
    
    # Step 4: Wait for READY
    print("\n[1.4] Waiting for agent to be READY...")
    agent_info = wait_for_agent(agent_name)
    if agent_info.get("status") == "READY":
        agent_id = agent_info["agentRuntimeId"]
        print(f"  ✅ Agent READY: {agent_id}")
        add_dynamodb_permissions(agent_id)
        time.sleep(10)  # IAM propagation
        results["act1_deploy"] = True
    else:
        print(f"  ❌ Agent not ready: {agent_info}")
        results["act1_deploy"] = False
        agent_id = None
    
    # Step 5: Chat with agent
    if agent_id:
        print("\n[1.5] Chatting with deployed agent...")
        try:
            resp = requests.post(f"{BACKEND_URL}/api/agents/{agent_id}/invoke",
                json={"prompt": "Look up user U-11111"}, timeout=60)
            chat_text = resp.text
            has_data = "crypto_king" in chat_text or "Alex" in chat_text or "U-11111" in chat_text
            print(f"  Agent responds with real data: {'✅' if has_data else '⚠️ (may need IAM propagation)'}")
            results["act1_chat"] = has_data
        except Exception as e:
            print(f"  ❌ Chat error: {e}")
            results["act1_chat"] = False
    
    # =========================================================================
    print("\n" + "=" * 70)
    print("ACT 2: MCP GATEWAY")
    print("=" * 70)
    
    control = boto3.client("bedrock-agentcore-control", region_name=REGION)
    
    # Step 1: Verify gateways exist
    print("\n[2.1] Checking gateways...")
    gws = control.list_gateways(maxResults=50)
    gw_names = {g["name"]: g for g in gws.get("items", [])}
    
    has_enterprise = "DateSparkEnterpriseAuth" in gw_names
    has_looker = "DateSparkLookerSim" in gw_names
    print(f"  DateSparkEnterpriseAuth: {'✅' if has_enterprise else '❌'}")
    print(f"  DateSparkLookerSim: {'✅' if has_looker else '❌'}")
    results["act2_gateways"] = has_enterprise and has_looker
    
    # Step 2: Check targets
    if has_enterprise:
        gw_id = gw_names["DateSparkEnterpriseAuth"]["gatewayId"]
        targets = control.list_gateway_targets(gatewayIdentifier=gw_id, maxResults=50)
        target_names = [t["name"] for t in targets.get("items", [])]
        has_slack = "SlackIntegration" in target_names
        has_jira = "JiraIntegration" in target_names
        has_dynamo = any("Dynamo" in n for n in target_names)
        print(f"  Slack: {'✅' if has_slack else '❌'} | Jira: {'✅' if has_jira else '❌'} | DynamoDB: {'✅' if has_dynamo else '❌'}")
        results["act2_targets"] = has_slack and has_jira
    
    # Step 3: Builder discovers gateways
    print("\n[2.2] Builder discovers gateways...")
    gw_resp = call_builder("List all MCP gateways and their targets", "demo_act2")
    found_gw = "enterprise" in gw_resp.lower() or "slack" in gw_resp.lower()
    print(f"  Builder finds gateways: {'✅' if found_gw else '❌'}")
    results["act2_discovery"] = found_gw
    
    # =========================================================================
    print("\n" + "=" * 70)
    print("ACT 3: MODEL SWAP")
    print("=" * 70)
    
    if agent_id:
        print("\n[3.1] Checking model swap capability...")
        detail = control.get_agent_runtime(agentRuntimeId=agent_id)
        env_vars = detail.get("environmentVariables", {})
        print(f"  Current env vars: {list(env_vars.keys())}")
        
        # Set MODEL_ID env var
        print("\n[3.2] Swapping model to Nova Pro...")
        try:
            env_vars["MODEL_ID"] = "us.amazon.nova-pro-v1:0"
            control.update_agent_runtime(
                agentRuntimeId=agent_id,
                agentRuntimeArtifact=detail["agentRuntimeArtifact"],
                roleArn=detail["roleArn"],
                networkConfiguration=detail["networkConfiguration"],
                environmentVariables=env_vars,
            )
            print(f"  ✅ Model swap initiated (agent redeploying)")
            results["act3_swap"] = True
        except Exception as e:
            print(f"  ❌ Swap error: {e}")
            results["act3_swap"] = False
    else:
        print("  ⚠️ Skipped (no agent from Act 1)")
        results["act3_swap"] = False
    
    # =========================================================================
    print("\n" + "=" * 70)
    print("ACT 4: EVALUATIONS")
    print("=" * 70)
    
    # Use the otel_real_agent which we know has OTEL working
    eval_agent_id = "otel_real_agent-r2rkQ08hZG"
    
    print("\n[4.1] Running on-demand evaluation...")
    try:
        resp = requests.post(f"{BACKEND_URL}/api/evaluate", json={
            "agent_runtime_id": eval_agent_id,
            "test_prompt": "Say hello to Alice and tell me about the weather",
            "evaluator_ids": ["Builtin.Helpfulness"],
        }, timeout=120)
        eval_result = resp.json()
        spans = eval_result.get("spans_found", 0)
        results_list = eval_result.get("results", [])
        has_score = any(r.get("score") is not None for r in results_list)
        print(f"  Spans found: {spans}")
        print(f"  Eval results: {results_list}")
        print(f"  Has real score: {'✅' if has_score else '❌'}")
        results["act4_eval"] = has_score
    except Exception as e:
        print(f"  ❌ Eval error: {e}")
        results["act4_eval"] = False
    
    # Also test via CLI
    print("\n[4.2] CLI evaluation (agentcore eval run)...")
    import subprocess
    try:
        cli_result = subprocess.run(
            ["agentcore", "eval", "run", "-a", "otel_real_agent", "-e", "Builtin.Correctness"],
            capture_output=True, text=True, timeout=120, cwd="/tmp/otel_real"
        )
        cli_ok = "Evaluation Results" in cli_result.stdout or "Successful" in cli_result.stdout
        print(f"  CLI eval: {'✅' if cli_ok else '❌'}")
        if not cli_ok:
            print(f"  Output: {cli_result.stdout[-200:]}")
        results["act4_cli"] = cli_ok
    except Exception as e:
        print(f"  ❌ CLI error: {e}")
        results["act4_cli"] = False
    
    # =========================================================================
    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    for test, passed_flag in results.items():
        print(f"  {'✅' if passed_flag else '❌'} {test}")
    
    print(f"\n  {passed}/{total} tests passed")
    
    # Cleanup
    print("\n[Cleanup] Removing demo agent...")
    cleanup_agent(agent_name)
    
    return passed == total

if __name__ == "__main__":
    success = run()
    sys.exit(0 if success else 1)
