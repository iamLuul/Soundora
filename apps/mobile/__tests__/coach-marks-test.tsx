// Dicas de primeira vez: aparecem uma vez, "Próxima" avança, "Pular"/"Entendi" fecham de vez.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CoachMarks, useFirstTimeTip } from '../src/components/CoachMarks';
import i18n from '../src/lib/i18n';
import { tipSeen } from '../src/lib/tips';

const steps = [
  { icon: 'heart-outline' as const, title: 'Passo um', body: 'Primeiro' },
  { icon: 'play-outline' as const, title: 'Passo dois', body: 'Segundo' },
];

function Host() {
  const [open, close] = useFirstTimeTip('vibe-view');
  return <CoachMarks testID="coach-x" visible={open} steps={steps} onClose={close} />;
}

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});
beforeEach(() => globalThis.localStorage?.removeItem('soundora.tip.vibe-view'));

test('avança passo a passo e não aparece de novo depois de concluída', async () => {
  await render(<Host />);
  expect(screen.getByText('Passo um')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('coach-x-next'));
  expect(screen.getByText('Passo dois')).toBeTruthy();
  // No último passo não há "Pular": o botão fecha.
  expect(screen.queryByTestId('coach-x-skip')).toBeNull();
  await fireEvent.press(screen.getByTestId('coach-x-next'));
  expect(screen.queryByTestId('coach-x')).toBeNull();
  expect(tipSeen('vibe-view')).toBe(true);
});

test('dica já vista não aparece', async () => {
  globalThis.localStorage?.setItem('soundora.tip.vibe-view', '1');
  await render(<Host />);
  expect(screen.queryByTestId('coach-x')).toBeNull();
});

test('pular fecha e marca como vista', async () => {
  await render(<Host />);
  await fireEvent.press(screen.getByTestId('coach-x-skip'));
  expect(screen.queryByTestId('coach-x')).toBeNull();
  expect(tipSeen('vibe-view')).toBe(true);
});
