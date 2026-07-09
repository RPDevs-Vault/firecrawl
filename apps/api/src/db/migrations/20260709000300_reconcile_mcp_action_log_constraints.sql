do $$
begin
  if to_regclass('public.mcp_action_logs') is not null then
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_no_raw_secrets;
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_resource_metadata_safe;
    alter table public.mcp_action_logs drop constraint if exists mcp_action_logs_metadata_safe;

    alter table public.mcp_action_logs add constraint mcp_action_logs_no_raw_secrets check (
      auth_type not like '%Bearer%'
    );

    alter table public.mcp_action_logs add constraint mcp_action_logs_metadata_safe check (
      char_length(tool_name) <= 128 and tool_name !~ '[[:cntrl:]]' and tool_name !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)' and
      (oauth_client_id is null or (char_length(oauth_client_id) <= 128 and oauth_client_id !~ '[[:cntrl:]]' and oauth_client_id !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (request_id is null or (char_length(request_id) <= 256 and request_id !~ '[[:cntrl:]]' and request_id !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (user_agent is null or (char_length(user_agent) <= 512 and user_agent !~ '[[:cntrl:]]' and user_agent !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (client_name is null or (char_length(client_name) <= 128 and client_name !~ '[[:cntrl:]]' and client_name !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (client_version is null or (char_length(client_version) <= 128 and client_version !~ '[[:cntrl:]]' and client_version !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (error_class is null or (char_length(error_class) <= 128 and error_class !~ '[[:cntrl:]]' and error_class !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)')) and
      (resource is null or (char_length(resource) <= 512 and resource !~ '[[:cntrl:]]' and resource !~* '(Bearer\s+[^[:space:]]+|fc-[A-Za-z0-9_-]+|fco_[A-Za-z0-9_-]+|fcr_[A-Za-z0-9_-]+)'))
    );
  end if;
end $$;
