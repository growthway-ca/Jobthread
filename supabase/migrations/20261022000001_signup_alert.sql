-- JobThread: email the founder when a contractor finishes setting up.
--
-- After a contractor saves their profile (name, business, mobile), this sends a
-- short email through Resend's API using pg_net. It needs two Vault secrets:
--   resend_api_key   a Resend API key with sending access
--   signup_alert_to  the address the alert goes to
-- Without them, or if sending fails for any reason, sign-up carries on and no
-- email is sent. The sender (alerts@jobthread.ca) must be on a domain verified
-- in Resend.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

create function private.signup_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  api_key    text;
  alert_to   text;
  user_email text;
begin
  -- Never let the alert get in the way of signing up.
  begin
    select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
    select decrypted_secret into alert_to from vault.decrypted_secrets where name = 'signup_alert_to';
    if api_key is null or alert_to is null then
      return new;
    end if;
    select email into user_email from auth.users where id = new.id;
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'JobThread <alerts@jobthread.ca>',
        'to', jsonb_build_array(alert_to),
        'subject', 'New contractor: ' || new.business_name,
        'text', format(
          E'%s from %s just set up JobThread.\n\nMobile: %s\nEmail: %s\n\nGive them a call.',
          new.name, new.business_name, new.phone, coalesce(user_email, 'unknown')
        )
      )
    );
  exception when others then
    raise warning 'signup alert not sent: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function private.signup_alert() from public;

create trigger contractors_signup_alert
  after insert on public.contractors
  for each row execute function private.signup_alert();
