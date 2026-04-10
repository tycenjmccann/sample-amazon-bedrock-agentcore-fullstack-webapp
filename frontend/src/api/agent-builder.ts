export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentBuilderChatRequest {
  messages: ChatMessage[];
  template_context?: string;
}

export interface StreamEvent {
  type: 'text' | 'done';
  content?: string;
}

/**
 * Stream chat with the Agent Builder Agent (a real Strands agent with memory + tools).
 * Falls back to the management backend Converse API if the builder agent is unavailable.
 */
export async function streamAgentBuilderChat(
  request: AgentBuilderChatRequest,
  onText: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  sessionId?: string,
): Promise<void> {
  try {
    // Try the real builder agent first
    const lastUserMsg = request.messages.filter(m => m.role === 'user').pop();
    const prompt = lastUserMsg?.content || '';

    const response = await fetch('/builder/invocations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        session_id: sessionId || `builder_${Date.now()}`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      onError(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('No response stream available');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            // Handle structured SSE events: {type: "text", content: "..."}
            if (parsed && typeof parsed === 'object' && parsed.type === 'text' && parsed.content) {
              onText(parsed.content);
            } else if (parsed && typeof parsed === 'object' && parsed.type === 'done') {
              onDone();
              return;
            } else if (typeof parsed === 'string') {
              // Handle raw string SSE events from Strands agent: data: "text chunk"
              onText(parsed);
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }

    // If we get here without a 'done' event, call onDone anyway
    onDone();
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Parse agent-config and python-deploy blocks from an assistant message.
 * Returns the agent config and deployable code if found.
 */
export function parseDeployableCode(
  content: string,
): { agentConfig: { agent_name: string; description: string } | null; code: string | null } {
  let agentConfig = null;
  let code = null;

  // Extract agent-config block
  const configMatch = content.match(/```agent-config\s*\n([\s\S]*?)\n```/);
  if (configMatch) {
    try {
      agentConfig = JSON.parse(configMatch[1].trim());
    } catch {
      // Invalid JSON in config block
    }
  }

  // Extract python-deploy block (or fall back to regular python block)
  const codeMatch = content.match(/```python-deploy\s*\n([\s\S]*?)\n```/) 
    || content.match(/```python\s*\n([\s\S]*?)\n```/);
  if (codeMatch) {
    code = codeMatch[1].trim();
  }

  return { agentConfig, code };
}
