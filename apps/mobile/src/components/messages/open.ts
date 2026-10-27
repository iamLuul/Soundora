import { router } from 'expo-router';
import { findDm } from '../../lib/api';
import type { PersonCard } from '../../lib/types';

/** Abre a conversa com alguém: a que já existe, ou uma nova (criada na primeira mensagem). */
export async function openConversationWith(person: Pick<PersonCard, 'id' | 'username' | 'display_name' | 'avatar_url'>, replace = false) {
  const id = await findDm(person.id);
  const go = replace ? router.replace : router.push;
  if (id) go(`/messages/${id}`);
  else
    go({
      pathname: '/messages/[id]',
      params: { id: 'draft', to: person.id, username: person.username, name: person.display_name, avatar: person.avatar_url ?? '' },
    });
}
