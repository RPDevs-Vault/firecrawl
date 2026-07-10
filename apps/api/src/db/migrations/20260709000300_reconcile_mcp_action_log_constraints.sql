do $$
begin
  if to_regclass('public.mcp_action_logs') is not null then
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_no_raw_secrets;
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_resource_metadata_safe;
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_metadata_safe;
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_auth_type_check;
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_status_check;

    alter table public.mcp_action_logs add constraint mcp_action_logs_status_check check (status in ('started', 'success', 'error'));
    alter table public.mcp_action_logs add constraint mcp_action_logs_auth_type_check check (auth_type in ('oauth', 'api-key', 'keyless', 'unknown'));

    alter table public.mcp_action_logs add constraint mcp_action_logs_no_raw_secrets check (
      auth_type !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)'
    );

    alter table public.mcp_action_logs add constraint mcp_action_logs_metadata_safe check (
      char_length(tool_name) <= 128 and tool_name !~ '[[:cntrl:]]' and tool_name !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)' and
      (oauth_client_id is null or (char_length(oauth_client_id) <= 128 and oauth_client_id !~ '[[:cntrl:]]' and oauth_client_id !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (request_id is null or (char_length(request_id) <= 256 and request_id !~ '[[:cntrl:]]' and request_id !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (user_agent is null or (char_length(user_agent) <= 512 and user_agent !~ '[[:cntrl:]]' and user_agent !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (client_name is null or (char_length(client_name) <= 128 and client_name !~ '[[:cntrl:]]' and client_name !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (client_version is null or (char_length(client_version) <= 128 and client_version !~ '[[:cntrl:]]' and client_version !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (error_class is null or (char_length(error_class) <= 128 and error_class !~ '[[:cntrl:]]' and error_class !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (resource is null or (char_length(resource) <= 512 and resource !~ '[[:cntrl:]]' and resource !~* '(Bearer\s+[^[:space:]]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)'))
    );

    alter table public.mcp_action_logs enable row level security;
    revoke all on table public.mcp_action_logs from anon, authenticated;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      grant select, insert on table public.mcp_action_logs to service_role;
    end if;
  end if;
end $$;

create index if not exists mcp_action_logs_team_created_at_idx on public.mcp_action_logs(team_id, created_at desc, id desc);
create index if not exists mcp_action_logs_team_user_created_at_idx on public.mcp_action_logs(team_id, user_id, created_at desc, id desc) where user_id is not null and auth_type = 'oauth';
create index if not exists mcp_action_logs_api_key_created_at_idx on public.mcp_action_logs(api_key_id, created_at desc) where api_key_id is not null;
create index if not exists mcp_action_logs_oauth_client_created_at_idx on public.mcp_action_logs(oauth_client_id, created_at desc) where oauth_client_id is not null;
