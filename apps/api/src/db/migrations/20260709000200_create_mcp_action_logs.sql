create table if not exists public.mcp_action_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid null,
  api_key_id bigint null,
  oauth_client_id text null,
  auth_type text not null,
  tool_name text not null,
  status text not null check (status in ('started', 'success', 'error')),
  request_id text null,
  user_agent text null,
  client_name text null,
  client_version text null,
  error_class text null,
  resource text null,
  created_at timestamptz not null default now(),
  constraint mcp_action_logs_no_raw_secrets check (
    auth_type not like '%Bearer%' and tool_name not like '%fc-%'
  ),
  constraint mcp_action_logs_resource_metadata_safe check (
    resource is null or (char_length(resource) <= 512 and resource !~ '[[:cntrl:]]')
  )
);

create index if not exists mcp_action_logs_team_created_at_idx on public.mcp_action_logs(team_id, created_at desc, id desc);
create index if not exists mcp_action_logs_api_key_created_at_idx on public.mcp_action_logs(api_key_id, created_at desc) where api_key_id is not null;
create index if not exists mcp_action_logs_oauth_client_created_at_idx on public.mcp_action_logs(oauth_client_id, created_at desc) where oauth_client_id is not null;
