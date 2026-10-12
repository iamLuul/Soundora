// Prévia que já tocou até o fim: o play volta para o começo e toca de novo.
import { render } from '@testing-library/react-native';
import { VibeAudio } from '../src/components/vibes/VibeAudio';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => undefined), loop: false, muted: false, currentTime: 30, duration: 30 };
jest.mock('expo-audio', () => ({
  setAudioModeAsync: async () => undefined,
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ currentTime: 30, duration: 30, playing: false, didJustFinish: false, playbackState: 'idle' }),
}));

test('tocar de novo depois do fim volta para o começo', async () => {
  const view = await render(<VibeAudio url="https://cdnt-preview.dzcdn.net/1.mp3" paused muted={false} />);
  expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  await view.rerender(<VibeAudio url="https://cdnt-preview.dzcdn.net/1.mp3" paused={false} muted={false} />);
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  expect(mockPlayer.play).toHaveBeenCalled();
});

test('no meio da prévia, continua de onde parou', async () => {
  mockPlayer.seekTo.mockClear();
  mockPlayer.currentTime = 12;
  const view = await render(<VibeAudio url="https://cdnt-preview.dzcdn.net/2.mp3" paused muted={false} />);
  await view.rerender(<VibeAudio url="https://cdnt-preview.dzcdn.net/2.mp3" paused={false} muted={false} />);
  expect(mockPlayer.seekTo).not.toHaveBeenCalled();
});
