-- Notificações ao vivo: quando alguém curte, comenta, responde ou segue, o app de quem recebe
-- fica sabendo na hora (sino, lista de notificações, comentários e contadores), sem precisar
-- puxar para atualizar.
--
-- Usa o Broadcast do Supabase Realtime num canal PRIVADO por pessoa ("user:<id>"):
-- - a tabela notifications continua fechada para o app (nada de ler a tabela pelo Realtime);
-- - o aviso leva só o tipo e o post (nada de quem fez, e-mail ou texto); o app busca o resto
--   pelas funções de sempre, que já checam login, bloqueios e permissões;
-- - só a própria pessoa (JWT) pode ouvir o canal dela, e ninguém pode publicar nele pelo app
--   (sem policy de insert): os avisos saem só deste trigger.

create function private.tg_notification_live() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.notifications;
begin
  -- Só ações de alguém logado no app. Scripts com a chave secreta (carga de testes, demo)
  -- inserem milhares de notificações de uma vez e não precisam de aviso ao vivo.
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('kind', r.kind, 'post_id', r.post_id, 'removed', tg_op = 'DELETE'),
      'notification',
      'user:' || r.user_id::text,
      true
    );
  exception when others then
    -- O aviso ao vivo é um extra: se o Realtime falhar, a curtida/comentário não pode falhar.
    null;
  end;
  return null;
end;
$$;
revoke execute on function private.tg_notification_live() from public;

create trigger live after insert or delete on public.notifications
  for each row execute function private.tg_notification_live();

-- Quem pode ouvir: só a pessoa logada, no canal com o próprio id.
create policy "notificações ao vivo: só o próprio canal"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'user:' || (select auth.uid())::text
  );
