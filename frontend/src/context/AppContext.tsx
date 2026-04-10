import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { AgentRuntimeSummary, listAgents } from '../api/agents';
import { GatewaySummary, listGateways } from '../api/gateways';
import { MemorySummary, listMemories } from '../api/memory';

// Builder chat message type (mirrors AgentsListPage)
export interface BuilderMessage {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isSystem?: boolean;
}

export interface CanvasState {
  code: string;
  agentName: string;
  description: string;
}

interface AppState {
  // Cached API data
  agents: AgentRuntimeSummary[];
  gateways: GatewaySummary[];
  memories: MemorySummary[];
  dataLoaded: boolean;
  loadData: () => Promise<void>;
  refreshAgents: () => Promise<void>;

  // Builder chat persistence
  builderMessages: BuilderMessage[];
  setBuilderMessages: React.Dispatch<React.SetStateAction<BuilderMessage[]>>;
  builderCanvas: CanvasState | null;
  setBuilderCanvas: React.Dispatch<React.SetStateAction<CanvasState | null>>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [gateways, setGateways] = useState<GatewaySummary[]>([]);
  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [builderMessages, setBuilderMessages] = useState<BuilderMessage[]>([]);
  const [builderCanvas, setBuilderCanvas] = useState<CanvasState | null>(null);
  const loadingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [a, g, m] = await Promise.allSettled([listAgents(), listGateways(), listMemories()]);
      if (a.status === 'fulfilled') setAgents(a.value);
      if (g.status === 'fulfilled') setGateways(g.value);
      if (m.status === 'fulfilled') setMemories(m.value);
      setDataLoaded(true);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const refreshAgents = useCallback(async () => {
    try {
      const data = await listAgents();
      setAgents(data);
    } catch { /* ignore */ }
  }, []);

  return (
    <AppContext.Provider value={{
      agents, gateways, memories, dataLoaded, loadData, refreshAgents,
      builderMessages, setBuilderMessages, builderCanvas, setBuilderCanvas,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}
