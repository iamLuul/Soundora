-- Perfis verificados: a insígnia aparece ao lado do nome (posts, perfil, comentários, busca,
-- seguidores, vibes e contas sugeridas).
--
-- Quem verifica é só a equipe, direto no banco (SQL Editor do Supabase ou chave secreta):
--   update public.profiles set verified = true where username = 'fulano';
-- O app não consegue se verificar: a coluna fica fora do "grant update" do perfil (o app só
-- pode mudar display_name, bio e locale).

alter table public.profiles add column verified boolean not null default false;

-- A lista de verificados é pequena e o app busca inteira (por username).
create index profiles_verified on public.profiles (username) where verified;
