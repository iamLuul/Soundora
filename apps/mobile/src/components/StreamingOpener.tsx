import { platformSearchUrl, type StreamingChoice } from '@soundhora/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { setStreamingPlatform } from '../lib/api';
import { formatError } from '../lib/errors';
import { keys, useStreamingPlatform } from '../lib/queries';
import { colors, fonts, space, text } from '../theme';
import { StreamingPicker } from './StreamingPicker';
import { SheetBackdrop } from './ui';

/** Música para abrir: identifica o pedido e serve para a busca se o servidor não responder. */
export interface OpenTarget {
  key: string;
  title: string;
  artist: string;
}

/**
 * Abre músicas na plataforma de streaming da pessoa (Em alta, Descobrir). Sem plataforma
 * escolhida (conta antiga), pergunta uma vez, salva e já abre. Se o servidor não achar o link,
 * abre a busca da música na plataforma. Renderize `chooser` na tela.
 */
export function useStreamingOpener(resolve: (target: OpenTarget, platform: StreamingChoice) => Promise<string>): {
  open: (target: OpenTarget) => void;
  opening: string | null;
  message: string | null;
  platform: StreamingChoice | null;
  chooser: ReactElement;
} {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const platform = useStreamingPlatform();
  const [opening, setOpening] = useState<string | null>(null);
  const [pending, setPending] = useState<OpenTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const go = async (target: OpenTarget, choice: StreamingChoice) => {
    setOpening(target.key);
    setMessage(null);
    let url: string;
    try {
      url = await resolve(target, choice);
    } catch {
      // Sem resposta do servidor: a busca da música na plataforma sempre funciona.
      url = platformSearchUrl(choice, target.title, target.artist);
    }
    try {
      // Na web, abre numa aba nova para o Soundhora continuar aberto.
      if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
      else await Linking.openURL(url);
    } catch (err) {
      setMessage(formatError(t, err));
    } finally {
      setOpening(null);
    }
  };

  const open = (target: OpenTarget) => {
    if (platform.data) void go(target, platform.data);
    else setPending(target);
  };

  const choose = async (choice: StreamingChoice) => {
    setSaving(true);
    try {
      await setStreamingPlatform(choice);
      qc.setQueryData(keys.streamingPlatform, choice);
      const target = pending;
      setPending(null);
      if (target) await go(target, choice);
    } catch (err) {
      setMessage(formatError(t, err));
      setPending(null);
    } finally {
      setSaving(false);
    }
  };

  const chooser = (
    <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => setPending(null)}>
      <SheetBackdrop style={styles.backdrop} onClose={() => setPending(null)} label={t('common.cancel')}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('streaming.title')}</Text>
          <Text style={[text.small, { textAlign: 'center' }]}>{t('streaming.hint')}</Text>
          <StreamingPicker value={null} onChange={choose} disabled={saving} />
        </View>
      </SheetBackdrop>
    </Modal>
  );

  return { open, opening, message, platform: platform.data ?? null, chooser };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, gap: space.md, maxWidth: 640, width: '100%', alignSelf: 'center' },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, textAlign: 'center' },
});
