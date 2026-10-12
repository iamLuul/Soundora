import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { splitMentions } from '../lib/mentions';
import { fonts } from '../theme';

/** Texto de post, comentário ou resposta com cada @username em negrito. */
export function MentionText({ children, ...props }: Omit<ComponentProps<typeof Text>, 'children'> & { children: string }) {
  return (
    <Text {...props}>
      {splitMentions(children).map((p, i) =>
        p.mention ? (
          <Text key={i} style={{ fontFamily: fonts.bold }}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}
