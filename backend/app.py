"""
AgentCore Operations Dashboard — Backend API

Lightweight FastAPI backend that proxies AWS AgentCore management APIs.
The frontend calls these endpoints; this backend calls AWS with IAM credentials.
"""

import json
import logging
import os
import re
import tempfile
import zipfile
from io import BytesIO
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

app = FastAPI(title="AgentCore Operations API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))


def get_control_client():
    return boto3.client("bedrock-agentcore-control", region_name=REGION)


def get_memory_client():
    return boto3.client("bedrock-agentcore", region_name=REGION)


# ---------------------------------------------------------------------------
# Agent Runtimes
# ---------------------------------------------------------------------------

@app.get("/api/agents")
def list_agents(max_results: int = Query(default=50, le=100)):
    """List all AgentCore runtimes in the account."""
    try:
        client = get_control_client()
        response = client.list_agent_runtimes(maxResults=max_results)
        runtimes = response.get("agentRuntimes", [])
        # Convert datetime objects to ISO strings for JSON serialization
        for rt in runtimes:
            if "lastUpdatedAt" in rt:
                rt["lastUpdatedAt"] = rt["lastUpdatedAt"].isoformat()
        return {"agentRuntimes": runtimes}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/{agent_runtime_id}")
def get_agent(agent_runtime_id: str):
    """Get full details for a specific agent runtime."""
    try:
        client = get_control_client()
        response = client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        # Remove ResponseMetadata
        response.pop("ResponseMetadata", None)
        # Convert datetimes
        for key in ("createdAt", "lastUpdatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Agent runtime not found")
        raise HTTPException(status_code=500, detail=str(e))


class UpdateAgentEnvVars(BaseModel):
    environmentVariables: dict


@app.put("/api/agents/{agent_runtime_id}/env")
def update_agent_env(agent_runtime_id: str, body: UpdateAgentEnvVars):
    """Update environment variables for an agent runtime (e.g., swap model_id)."""
    try:
        client = get_control_client()
        # First get current runtime to preserve required fields
        current = client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        current.pop("ResponseMetadata", None)

        response = client.update_agent_runtime(
            agentRuntimeId=agent_runtime_id,
            agentRuntimeArtifact=current["agentRuntimeArtifact"],
            roleArn=current["roleArn"],
            networkConfiguration=current["networkConfiguration"],
            environmentVariables=body.environmentVariables,
        )
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "lastUpdatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Gateways
# ---------------------------------------------------------------------------

@app.get("/api/gateways")
def list_gateways(max_results: int = Query(default=50, le=1000)):
    """List all gateways."""
    try:
        client = get_control_client()
        response = client.list_gateways(maxResults=max_results)
        items = response.get("items", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"gateways": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gateways/{gateway_id}")
def get_gateway(gateway_id: str):
    """Get details of a specific gateway."""
    try:
        client = get_control_client()
        response = client.get_gateway(gatewayIdentifier=gateway_id)
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "updatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Gateway not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gateways/{gateway_id}/targets")
def list_gateway_targets(gateway_id: str, max_results: int = Query(default=50, le=1000)):
    """List tool targets for a gateway."""
    try:
        client = get_control_client()
        response = client.list_gateway_targets(
            gatewayIdentifier=gateway_id, maxResults=max_results
        )
        items = response.get("items", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"targets": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------

@app.get("/api/memory")
def list_memories(max_results: int = Query(default=50, le=100)):
    """List all memory stores."""
    try:
        client = get_control_client()
        response = client.list_memories(maxResults=max_results)
        items = response.get("memories", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"memories": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/memory/{memory_id}")
def get_memory(memory_id: str):
    """Get details of a specific memory store."""
    try:
        client = get_control_client()
        response = client.get_memory(memoryId=memory_id)
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "updatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Memory store not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/memory/{memory_id}/records")
def list_memory_records(memory_id: str, namespace: Optional[str] = None):
    """Retrieve memory records from a memory store."""
    try:
        client = get_memory_client()
        params = {"memoryId": memory_id}
        if namespace:
            params["namespace"] = namespace
        response = client.list_memory_records(**params)
        response.pop("ResponseMetadata", None)
        return response
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------

@app.get("/api/policies/{policy_engine_id}")
def list_policies(policy_engine_id: str, max_results: int = Query(default=50, le=100)):
    """List policies for a policy engine."""
    try:
        client = get_control_client()
        response = client.list_policies(
            policyEngineId=policy_engine_id, maxResults=max_results
        )
        items = response.get("policies", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"policies": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/policies/{policy_engine_id}/{policy_id}")
def get_policy(policy_engine_id: str, policy_id: str):
    """Get a specific policy."""
    try:
        client = get_control_client()
        response = client.get_policy(
            policyEngineId=policy_engine_id, policyId=policy_id
        )
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "updatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Policy not found")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {"status": "ok", "region": REGION}


# ---------------------------------------------------------------------------
# Agent Builder — Bedrock-powered agent configuration assistant
# ---------------------------------------------------------------------------

AGENT_BUILDER_MODEL_ID = os.environ.get(
    "AGENT_BUILDER_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514"
)

AGENT_BUILDER_SYSTEM_PROMPT = """You are an Agent Configuration Assistant for Amazon Bedrock AgentCore.
Your job is to help users create and configure AI agents using the Strands Agents SDK.

When a user describes an agent they want to build, you should:
1. Understand their requirements (purpose, tools needed, model choice)
2. Generate a complete, working Python agent file using the Strands SDK
3. Provide the configuration as a ready-to-deploy code block
4. Explain what each part does

IMPORTANT CODE GENERATION RULES:
- Always use `from strands import Agent, tool` for imports
- Always use `from strands.models import BedrockModel` for the model
- Always use `from bedrock_agentcore.runtime import BedrockAgentCoreApp` for the runtime
- Default model: `us.anthropic.claude-sonnet-4-20250514` unless user specifies otherwise
- Available alternative models: `us.meta.llama3-3-70b-instruct-v1:0`, `us.amazon.nova-pro-v1:0`
- Tools should be defined as functions decorated with `@tool`
- Each tool function MUST have a docstring explaining what it does
- Tool functions should return JSON strings using `json.dumps()`
- The agent entrypoint should use `@app.entrypoint` decorator
- Include `callback_handler=None` in the Agent constructor

When the user confirms they want to deploy, include a special marker in your response:
```agent-config
{"agent_name": "<name>", "description": "<description>"}
```

Followed by the complete agent code in a Python code block marked with:
```python-deploy
<complete agent code here>
```

This signals the system to offer a deploy button to the user.

If the user asks to modify an existing agent, ask what changes they want and generate
the updated configuration.

Be concise but thorough. Use markdown formatting for readability."""


def get_bedrock_client():
    return boto3.client("bedrock-runtime", region_name=REGION)


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class AgentBuilderChatRequest(BaseModel):
    messages: List[ChatMessage]
    template_context: Optional[str] = None


@app.post("/api/agent-builder/chat")
async def agent_builder_chat(body: AgentBuilderChatRequest):
    """Chat with the Agent Configuration Assistant using Bedrock Converse API with streaming."""
    try:
        client = get_bedrock_client()

        # Build the messages for the Converse API
        converse_messages = []
        for msg in body.messages:
            converse_messages.append({
                "role": msg.role,
                "content": [{"text": msg.content}],
            })

        # If there's template context, prepend it to the system prompt
        system_prompt = AGENT_BUILDER_SYSTEM_PROMPT
        if body.template_context:
            system_prompt += f"\n\nThe user selected the following template as a starting point:\n{body.template_context}"

        response = client.converse_stream(
            modelId=AGENT_BUILDER_MODEL_ID,
            system=[{"text": system_prompt}],
            messages=converse_messages,
            inferenceConfig={
                "maxTokens": 4096,
                "temperature": 0.7,
            },
        )

        def generate():
            stream = response.get("stream", [])
            for event in stream:
                if "contentBlockDelta" in event:
                    delta = event["contentBlockDelta"].get("delta", {})
                    text = delta.get("text", "")
                    if text:
                        yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
                elif "messageStop" in event:
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        logger.error(f"Bedrock Converse error: {error_code} - {error_message}")
        raise HTTPException(
            status_code=500,
            detail=f"Bedrock error: {error_message}",
        )
    except Exception as e:
        logger.error(f"Agent builder chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AgentDeployRequest(BaseModel):
    agent_name: str
    description: str
    agent_code: str
    model_id: Optional[str] = "us.anthropic.claude-sonnet-4-20250514"


@app.post("/api/agent-builder/deploy")
def agent_builder_deploy(body: AgentDeployRequest):
    """Deploy an agent to AgentCore Runtime.

    Creates a zip artifact from the generated agent code and calls
    the AgentCore CreateAgentRuntime API.
    """
    try:
        # Sanitize agent name for use as a runtime name
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "-", body.agent_name.lower().strip())
        if not safe_name:
            safe_name = "custom-agent"

        # Create a zip artifact containing the agent code
        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("strands_agent.py", body.agent_code)

            # Add a requirements.txt with the necessary dependencies
            requirements = (
                "strands-agents\n"
                "strands-agents-tools\n"
                "bedrock-agentcore\n"
                "boto3\n"
            )
            zf.writestr("requirements.txt", requirements)

        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        # Also write the zip to a temp file for reference
        with tempfile.NamedTemporaryFile(
            suffix=".zip", prefix=f"agent-{safe_name}-", delete=False
        ) as tmp:
            tmp.write(zip_bytes)
            artifact_path = tmp.name
            logger.info(f"Agent artifact saved to {artifact_path}")

        # Deploy to AgentCore using the control plane API
        client = get_control_client()

        # Get the account's default role ARN for agent runtimes
        # The user needs to have set up an AgentCore execution role
        role_arn = os.environ.get("AGENTCORE_EXECUTION_ROLE_ARN", "")
        if not role_arn:
            # Try to construct a default role ARN
            sts = boto3.client("sts", region_name=REGION)
            account_id = sts.get_caller_identity()["Account"]
            role_arn = f"arn:aws:iam::{account_id}:role/BedrockAgentCoreExecutionRole"

        create_params = {
            "agentRuntimeName": safe_name,
            "description": body.description or f"Agent created via Agent Builder: {safe_name}",
            "agentRuntimeArtifact": {
                "codeConfiguration": {
                    "runtime": "PYTHON_3_13",
                    "entryPoint": ["python", "strands_agent.py"],
                },
                "s3Configuration": None,
            },
            "roleArn": role_arn,
            "networkConfiguration": {
                "networkMode": "PUBLIC",
            },
        }

        # If AGENTCORE_SUBNET_IDS and AGENTCORE_SECURITY_GROUP_IDS are set, use CUSTOMER_VPC mode
        subnet_ids = os.environ.get("AGENTCORE_SUBNET_IDS", "")
        sg_ids = os.environ.get("AGENTCORE_SECURITY_GROUP_IDS", "")
        if subnet_ids and sg_ids:
            create_params["networkConfiguration"] = {
                "networkMode": "CUSTOMER_VPC",
                "networkModeConfig": {
                    "subnets": [s.strip() for s in subnet_ids.split(",")],
                    "securityGroups": [s.strip() for s in sg_ids.split(",")],
                },
            }

        response = client.create_agent_runtime(**create_params)
        response.pop("ResponseMetadata", None)

        # Convert datetimes
        for key in ("createdAt", "lastUpdatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()

        return {
            "status": "deploying",
            "agentRuntimeId": response.get("agentRuntimeId"),
            "agentRuntimeName": safe_name,
            "artifactPath": artifact_path,
            "message": f"Agent '{safe_name}' is being deployed to AgentCore Runtime.",
            "response": response,
        }
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        logger.error(f"AgentCore deploy error: {error_code} - {error_message}")
        raise HTTPException(
            status_code=500,
            detail=f"Deployment failed: {error_message}",
        )
    except Exception as e:
        logger.error(f"Agent deploy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agent-builder/deploy/{agent_runtime_id}/status")
def agent_builder_deploy_status(agent_runtime_id: str):
    """Check the deployment status of an agent runtime."""
    try:
        client = get_control_client()
        response = client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "lastUpdatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return {
            "status": response.get("status", "UNKNOWN"),
            "agentRuntimeId": agent_runtime_id,
            "agentRuntimeName": response.get("agentRuntimeName"),
            "detail": response,
        }
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Agent runtime not found")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
