insert into public.admins (user_id)
select id from public.profiles where username = 'teste';