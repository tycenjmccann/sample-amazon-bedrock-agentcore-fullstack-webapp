"""
AgentCore Operations Dashboard — Backend API

Lightweight FastAPI backend that proxies AWS AgentCore management APIs.
The frontend calls these endpoints; this backend calls AWS with IAM credentials.
"""

import json
import logging
import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
