import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { confirmAction, notify } from '../lib/dialogs';
import { formatError } from '../lib/errors';
import { colors, fonts, glass, radius, space } from '../theme';
import { Reactive } from './Reactive';
import { Spinner } from './Spinner';
import { showToast } from './Toast';
import { Avatar, SheetBackdrop } from './ui';

/**
 * Trocar de conta (folha que sobe de baixo): as contas salvas neste aparelho, a aberta marcada,
 * e "Adicionar conta". Tocar numa conta abre ela sem sair e entrar de novo.
 */
export function AccountSwitcher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // Fechada, nem monta (a lista só é lida quando a pessoa abre).
  return visible ? <SwitcherSheet onClose={onClose} /> : null;
}

function SwitcherSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { accounts, session, switchAccount, addAccount, forgetSavedAccount } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const currentId = session?.user.id ?? null;
  // A aberta primeiro; as outras na ordem em que foram usadas.
  const list = [...accounts].sort((a, b) => Number(b.userId === currentId) - Number(a.userId === currentId));

  const open = async (userId: string, username: string) => {
    if (busy || userId === currentId) return onClose();
    setBusy(userId);
    try {
      await switchAccount(userId);
      onClose();
      // Começa do Início da outra conta (as telas abertas eram da anterior).
      router.replace('/');
      showToast(t('accounts.switched', { username }));
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    setBusy('add');
    try {
      await addAccount();
      onClose();
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const forget = async (userId: string, username: string) => {
    if (await confirmAction(t('accounts.forgetConfirm', { username }), t('accounts.remove'), t('common.cancel'))) await forgetSavedAccount(userId);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop style={styles.backdrop} onClose={onClose} label={t('common.cancel')}>
        <View style={styles.sheet} testID="account-switcher">
          <View style={styles.grabber} />
          <Text style={styles.title} accessibilityRole="header">
            {t('accounts.switch')}
          </Text>
          {list.map((a) => {
            const current = a.userId === currentId;
            return (
              <View key={a.userId} style={styles.rowWrap}>
                <Reactive
                  testID={`account-${a.username}`}
                  accessibilityRole="button"
                  accessibilityLabel={current ? `${a.displayName}, @${a.username}. ${t('accounts.current')}` : t('accounts.open', { username: a.username })}
                  accessibilityState={{ selected: current, busy: busy === a.userId }}
                  disabled={!!busy}
                  onPress={() => void open(a.userId, a.username)}
                  pressScale={0.97}
                  style={({ hovered, pressed }) => [styles.row, (hovered || pressed) && { backgroundColor: glass.pressed }]}
                >
                  <Avatar uri={a.avatarUrl} name={a.displayName} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {a.displayName}
                    </Text>
                    <Text style={styles.handle} numberOfLines={1}>
                      @{a.username}
                    </Text>
                  </View>
                  {busy === a.userId ? (
                    <Spinner size={20} />
                  ) : current ? (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} accessibilityLabel={t('accounts.current')} />
                  ) : null}
                </Reactive>
                {!current ? (
                  <Pressable
                    testID={`forget-${a.username}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('accounts.forget', { username: a.username })}
                    onPress={() => void forget(a.userId, a.username)}
                    hitSlop={8}
                    style={styles.forget}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          <Reactive
            testID="add-account"
            accessibilityRole="button"
            disabled={!!busy}
            onPress={() => void add()}
            pressScale={0.97}
            style={({ hovered, pressed }) => [styles.row, (hovered || pressed) && { backgroundColor: glass.pressed }]}
          >
            <View style={styles.addIcon}>{busy === 'add' ? <Spinner size={18} /> : <Ionicons name="add" size={24} color={colors.text} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{t('accounts.add')}</Text>
              <Text style={styles.hint}>{t('accounts.addHint')}</Text>
            </View>
          </Reactive>
        </View>
      </SheetBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    ...glass.sheet,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.sm,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 2,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.sm },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, paddingHorizontal: space.lg, paddingVertical: space.sm },
  rowWrap: { flexDirection: 'row', alignItems: 'center' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.md },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  forget: { padding: space.md },
  addIcon: { width: 44, height: 44, borderRadius: 22, ...glass.chip, alignItems: 'center', justifyContent: 'center' },
});
