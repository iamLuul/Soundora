import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { usePlaybackTurn } from '../../lib/feed-video';

/** Vídeo da vibe: toca uma vez, pausa junto com a vibe e avisa quando termina. */
export function VibeVideo({ uri, paused, loop = false, onEnd }: { uri: string; paused: boolean; loop?: boolean; onEnd?: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  // Enquanto a vibe toca, o vídeo da timeline (embaixo) fica pausado.
  usePlaybackTurn(!paused);

  useEffect(() => {
    if (paused && isPlaying) player.pause();
    else if (!paused && !isPlaying && player.currentTime < player.duration - 0.05) player.play();
  }, [paused, isPlaying, player]);

  useEffect(() => {
    if (!onEnd) return;
    const sub = player.addListener('playToEnd', onEnd);
    return () => sub.remove();
  }, [player, onEnd]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />;
}
