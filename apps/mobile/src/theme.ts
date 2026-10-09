/**
 * Tokens visuais do Soundora, tirados do guia visual da pesquisa:
 * Montserrat, roxo "Blue Genie" #6C62FF e tema escuro.
 */
export const colors = {
  primary: '#6C62FF', // Blue Genie
  background: '#3A374C', // Plush
  surface: '#5A5577', // The Fang
  muted: '#B3A9EB', // Maximum Blue Purple
  text: '#FFFFFF',
  textMuted: '#B3A9EB',
  border: 'rgba(179, 169, 235, 0.25)',
  danger: '#FF6B81',
  overlay: 'rgba(0, 0, 0, 0.4)',
} as const;

export const fonts = {
  regular: 'Montserrat_400Regular',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const text = {
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  subtitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  label: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
} as const;
