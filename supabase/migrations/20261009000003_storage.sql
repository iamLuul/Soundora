-- Bucket de avatares. Cada pessoa só escreve na própria pasta: avatars/{user_id}/...
-- Roda só onde existe o schema storage (Supabase). Nos testes locais de RLS, é ignorado.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$
      create policy "avatar: enviar na minha pasta" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "avatar: trocar o meu" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "avatar: apagar o meu" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end $$;
