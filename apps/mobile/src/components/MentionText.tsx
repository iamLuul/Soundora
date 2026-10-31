import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { splitMentions } from '../lib/mentions';
import { fonts } from '../theme';

/** Abre o perfil de quem foi marcado. */
export function openProfile(username: string) {
  router.push(`/u/${username.replace(/^@/, '').toLowerCase()}`);
}

/**
 * Texto de post, comentário ou resposta com cada @username em negrito. Tocar no @ abre o perfil
 * da pessoa (sem abrir o post em volta).
 */
export function MentionText({ children, ...props }: Omit<ComponentProps<typeof Text>, 'children'> & { children: string }) {
  return (
    <Text {...props}>
      {splitMentions(children).map((p, i) =>
        p.mention ? (
          <Text
            key={i}
            testID={`mention-${p.text.slice(1).toLowerCase()}`}
            accessibilityRole="link"
            suppressHighlighting
            onPress={(e) => {
              // O toque fica no @: não chega no post em volta (que abriria o post).
              e.stopPropagation?.();
              openProfile(p.text);
            }}
            style={{ fontFamily: fonts.bold }}
          >
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}
