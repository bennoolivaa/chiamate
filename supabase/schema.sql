-- Chiamate Aedify: tabelle, permessi e regole di accesso.
-- Da incollare in Supabase > SQL Editor DOPO aver creato i 3 utenti.
-- Si può rieseguire senza perdere dati.

-- 1. Numeri di telefono sempre nello stesso formato (+39...)
create or replace function public.normalizza_telefono(t text)
returns text language plpgsql immutable set search_path = '' as $$
declare s text;
begin
  s := regexp_replace(coalesce(t, ''), '[^0-9+]', '', 'g');
  if s like '00%' then s := '+' || substr(s, 3); end if;
  if left(s, 1) = '+' then
    return '+' || replace(substr(s, 2), '+', '');
  end if;
  -- già con prefisso 39 senza "+": fisso (390...) o cellulare (393... di 12 cifre)
  if (s like '390%' and length(s) >= 9) or (s like '393%' and length(s) >= 12) then
    return '+' || s;
  end if;
  return '+39' || s;
end $$;

-- 2. Tabelle
create table if not exists public.aziende (
  id bigint generated always as identity primary key,
  nome_azienda text not null,
  telefono text not null unique,
  comune text,
  email text,
  referente text,
  esito text not null default 'nuovo' check (esito in (
    'nuovo', 'non_risponde', 'segreteria', 'parlato_titolare', 'parlato_altri',
    'richiamare', 'manda_mail', 'demo_fissata', 'non_interessato', 'fuori_target')),
  richiamo_il timestamptz,
  appuntamento_il timestamptz,
  appuntamento_luogo text,
  note text,
  in_chiamata_da text,
  in_chiamata_dal timestamptz,
  ultimo_chiamante text,
  ultima_chiamata_il timestamptz,
  tentativi integer not null default 0,
  creato_da text,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create table if not exists public.storico_chiamate (
  id bigint generated always as identity primary key,
  azienda_id bigint not null references public.aziende(id) on delete cascade,
  utente_id uuid default auth.uid(),
  utente_nome text not null,
  chiamata_il timestamptz not null default now(),
  esito text not null,
  nota text
);

-- Chi può usare l'app (anche se qualcuno riuscisse a registrarsi, senza essere qui non vede nulla)
create table if not exists public.membri (
  user_id uuid primary key references auth.users(id) on delete cascade,
  aggiunto_il timestamptz not null default now()
);

create index if not exists aziende_comune_idx on public.aziende (comune);
create index if not exists aziende_esito_idx on public.aziende (esito);
create index if not exists aziende_richiamo_idx on public.aziende (richiamo_il) where richiamo_il is not null;
create index if not exists aziende_appuntamento_idx on public.aziende (appuntamento_il) where appuntamento_il is not null;
create index if not exists storico_azienda_idx on public.storico_chiamate (azienda_id, chiamata_il desc);
create index if not exists storico_data_idx on public.storico_chiamate (chiamata_il desc);

-- 3. Prima di salvare: telefono normalizzato e data di modifica
create or replace function public.prepara_azienda()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.telefono := public.normalizza_telefono(new.telefono);
  if length(new.telefono) < 9 then
    raise exception 'Numero di telefono non valido: %', new.telefono;
  end if;
  new.aggiornato_il := now();
  return new;
end $$;

drop trigger if exists prepara_azienda on public.aziende;
create trigger prepara_azienda before insert or update on public.aziende
  for each row execute function public.prepara_azienda();

-- 4. Controllo "è uno di noi?"
create or replace function public.e_membro()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membri where user_id = auth.uid());
$$;

-- 5. Registrare una chiamata: una riga nello storico + aggiornamento dell'azienda, insieme
create or replace function public.registra_chiamata(
  p_azienda_id bigint,
  p_esito text,
  p_nome text,
  p_nota text default null,
  p_referente text default null,
  p_email text default null,
  p_richiamo_il timestamptz default null,
  p_appuntamento_il timestamptz default null,
  p_appuntamento_luogo text default null
) returns public.aziende language plpgsql set search_path = '' as $$
declare risultato public.aziende;
begin
  insert into public.storico_chiamate (azienda_id, utente_nome, esito, nota)
  values (p_azienda_id, p_nome, p_esito, nullif(trim(p_nota), ''));

  update public.aziende set
    esito = p_esito,
    referente = coalesce(nullif(trim(p_referente), ''), referente),
    email = coalesce(nullif(trim(p_email), ''), email),
    richiamo_il = p_richiamo_il,
    appuntamento_il = case when p_esito = 'demo_fissata' then p_appuntamento_il else appuntamento_il end,
    appuntamento_luogo = case when p_esito = 'demo_fissata' then nullif(trim(p_appuntamento_luogo), '') else appuntamento_luogo end,
    in_chiamata_da = null,
    in_chiamata_dal = null,
    ultimo_chiamante = p_nome,
    ultima_chiamata_il = now(),
    tentativi = tentativi + 1
  where id = p_azienda_id
  returning * into risultato;

  if risultato.id is null then
    raise exception 'Azienda non trovata';
  end if;
  return risultato;
end $$;

-- "Sto chiamando": l'ora la mette il server, così vale per tutti
create or replace function public.segna_in_chiamata(p_azienda_id bigint, p_nome text)
returns void language sql set search_path = '' as $$
  update public.aziende set in_chiamata_da = p_nome, in_chiamata_dal = now() where id = p_azienda_id;
$$;

-- 6. Permessi: solo utenti collegati, mai "anon"
revoke all on table public.aziende, public.storico_chiamate, public.membri from anon, authenticated;
grant select, insert, update, delete on table public.aziende to authenticated;
grant select, insert on table public.storico_chiamate to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke usage, select on all sequences in schema public from anon;

revoke all on function public.normalizza_telefono(text) from public, anon;
revoke all on function public.prepara_azienda() from public, anon, authenticated;
revoke all on function public.e_membro() from public, anon;
revoke all on function public.registra_chiamata(bigint, text, text, text, text, text, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.segna_in_chiamata(bigint, text) from public, anon;
grant execute on function public.normalizza_telefono(text) to authenticated;
grant execute on function public.e_membro() to authenticated;
grant execute on function public.registra_chiamata(bigint, text, text, text, text, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.segna_in_chiamata(bigint, text) to authenticated;

-- 7. Regole di accesso (RLS)
alter table public.aziende enable row level security;
alter table public.storico_chiamate enable row level security;
alter table public.membri enable row level security;

drop policy if exists "membri leggono aziende" on public.aziende;
drop policy if exists "membri aggiungono aziende" on public.aziende;
drop policy if exists "membri modificano aziende" on public.aziende;
drop policy if exists "membri eliminano aziende" on public.aziende;
drop policy if exists "membri leggono storico" on public.storico_chiamate;
drop policy if exists "membri aggiungono storico" on public.storico_chiamate;

create policy "membri leggono aziende" on public.aziende
  for select to authenticated using ((select public.e_membro()));
create policy "membri aggiungono aziende" on public.aziende
  for insert to authenticated with check ((select public.e_membro()));
create policy "membri modificano aziende" on public.aziende
  for update to authenticated using ((select public.e_membro())) with check ((select public.e_membro()));
create policy "membri eliminano aziende" on public.aziende
  for delete to authenticated using ((select public.e_membro()));
create policy "membri leggono storico" on public.storico_chiamate
  for select to authenticated using ((select public.e_membro()));
create policy "membri aggiungono storico" on public.storico_chiamate
  for insert to authenticated with check ((select public.e_membro()));
-- membri: nessuna regola = nessuno può leggerla o modificarla dall'app

-- 8. Aggiornamenti in tempo reale
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'aziende') then
    alter publication supabase_realtime add table public.aziende;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'storico_chiamate') then
    alter publication supabase_realtime add table public.storico_chiamate;
  end if;
end $$;

-- 9. Abilita tutti gli utenti creati finora (se aggiungi un utente dopo, riesegui solo questa riga)
insert into public.membri (user_id) select id from auth.users on conflict do nothing;
