import { splitMentions } from '../src/lib/mentions';

test('menções viram pedaços próprios; e-mail e ponto final não', () => {
  expect(splitMentions('@ana.music adorei! valeu @bia_beats.')).toEqual([
    { text: '@ana.music', mention: true },
    { text: ' adorei! valeu ', mention: false },
    { text: '@bia_beats', mention: true },
    { text: '.', mention: false },
  ]);
  expect(splitMentions('me manda em raul@soundora.dev')).toEqual([{ text: 'me manda em raul@soundora.dev', mention: false }]);
  expect(splitMentions('(@raul) e @')).toEqual([
    { text: '(', mention: false },
    { text: '@raul', mention: true },
    { text: ') e @', mention: false },
  ]);
  expect(splitMentions('sem menção')).toEqual([{ text: 'sem menção', mention: false }]);
});
