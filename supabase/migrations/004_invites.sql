-- 004_invites.sql
-- Member invite table + atomic accept RPC used by the invites Edge Function.
-- Passcodes stay in member_credentials (bcrypt, RPC-only) — the single source
-- of truth that member_login verifies with crypt().

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'agent',
  token_hash text not null,                    -- hex(SHA-256(salt || ':' || token))
  token_salt text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint member_invites_role_check check (role in ('admin','agent','developer','viewer'))
);
create index if not exists member_invites_workspace_idx
  on public.member_invites (workspace_id, created_at desc);

-- Service-role only: RLS enabled with no policies (deny-all for anon/authenticated).
alter table public.member_invites enable row level security;

-- Atomic invite acceptance: verifies the token, creates the member, stores a
-- bcrypt passcode hash in member_credentials, and marks the invite used —
-- all in one transaction so a failed accept never burns the invite.
create or replace function public.member_accept_invite(
  p_invite_id uuid, p_token text, p_display_name text, p_passcode text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv public.member_invites%rowtype;
  v_name text;
  v_member_id uuid;
begin
  if p_passcode is null or length(p_passcode) < 8 or length(p_passcode) > 128 then
    raise exception 'passcode must be 8-128 characters';
  end if;

  select * into v_inv from public.member_invites where id = p_invite_id
    for update;
  if not found then
    raise exception 'invite not found';
  end if;
  if v_inv.used_at is not null then
    raise exception 'invite already used';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invite expired';
  end if;
  if encode(digest(v_inv.token_salt || ':' || p_token, 'sha256'), 'hex') <> v_inv.token_hash then
    raise exception 'invalid token';
  end if;

  v_name := nullif(trim(p_display_name), '');
  if v_name is null then v_name := v_inv.display_name; end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'display name must be 2-60 characters';
  end if;

  insert into public.members (workspace_id, display_name, role, email, status)
  values (v_inv.workspace_id, v_name, v_inv.role, v_inv.email, 'offline')
  returning id into v_member_id;

  insert into public.member_credentials (member_id, passcode_hash)
  values (v_member_id, crypt(p_passcode, gen_salt('bf')));

  update public.member_invites set used_at = now() where id = p_invite_id;

  return jsonb_build_object(
    'id', v_member_id,
    'workspace_id', v_inv.workspace_id,
    'display_name', v_name,
    'role', v_inv.role,
    'email', v_inv.email,
    'status', 'offline'
  );
end $$;
revoke all on function public.member_accept_invite(uuid, text, text, text) from anon, authenticated;
comment on function public.member_accept_invite(uuid, text, text, text) is
  'Service-role only. Atomically accepts a member invite (see invites Edge Function).';
