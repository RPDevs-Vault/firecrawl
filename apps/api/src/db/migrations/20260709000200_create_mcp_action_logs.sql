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
    auth_type not like '%Bearer%'
  ),
  constraint mcp_action_logs_metadata_safe check (
    char_length(tool_name) <= 128 and tool_name !~ '[[:cntrl:]]' and tool_name !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)' and
    (oauth_client_id is null or (char_length(oauth_client_id) <= 128 and oauth_client_id !~ '[[:cntrl:]]' and oauth_client_id !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
    (request_id is null or (char_length(request_id) <= 256 and request_id !~ '[[:cntrl:]]' and request_id !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
    (user_agent is null or (char_length(user_agent) <= 512 and user_agent !~ '[[:cntrl:]]' and user_agent !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
    (client_name is null or (char_length(client_name) <= 128 and client_name !~ '[[:cntrl:]]' and client_name !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
    (client_version is null or (char_length(client_version) <= 128 and client_version !~ '[[:cntrl:]]' and client_version !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
    (error_class is null or (char_length(error_class) <= 128 and error_class !~ '[[:cntrl:]]' and error_class !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
    (resource is null or (char_length(resource) <= 512 and resource !~ '[[:cntrl:]]' and resource !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)'))
  )
);

create index if not exists mcp_action_logs_team_created_at_idx on public.mcp_action_logs(team_id, created_at desc, id desc);
create index if not exists mcp_action_logs_api_key_created_at_idx on public.mcp_action_logs(api_key_id, created_at desc) where api_key_id is not null;
create index if not exists mcp_action_logs_oauth_client_created_at_idx on public.mcp_action_logs(oauth_client_id, created_at desc) where oauth_client_id is not null;
