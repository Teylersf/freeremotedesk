/** Mirror of `agent/src-tauri/src/config.rs::AgentConfig`. */
export type AgentConfig = {
  signaling_url: string | null;
  pwa_url: string | null;
  agent_id: string;
  trusted_clients: Record<string, TrustedClient>;
};

/** Mirror of `agent/src-tauri/src/config.rs::TrustedClient`. */
export type TrustedClient = {
  secret_hash: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
};

/** Mirror of `TrustedClientSummary` returned by list_trusted_clients. */
export type TrustedClientSummary = {
  client_id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
};
