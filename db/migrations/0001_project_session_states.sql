CREATE TABLE IF NOT EXISTS project_session_states (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  stage TEXT NOT NULL,
  readiness TEXT NOT NULL,
  summary TEXT,
  missing_fields TEXT NOT NULL,
  repo_requested INTEGER,
  build_requested INTEGER,
  next_action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
