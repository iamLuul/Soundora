/**
 * Tokens visuais do Soundhora, tirados do guia visual da pesquisa:
 * Montserrat, roxo "Blue Genie" #6C62FF e tema escuro.
 */
export const colors = {
  primary: '#685EFF', // Blue Genie (um tom mais escuro: texto branco nos botões com contraste 4.5:1)
  background: '#3A374C', // Plush
  surface: '#5A5577', // The Fang
  card: '#322F42', // cartões do perfil (Figma: Profile page)
  handle: '#A49FC3', // @usuário, placeholder da busca (clareado para contraste 4.5:1)
  placeholder: '#A3A3A3', // texto de exemplo nos campos (clareado para contraste 4.5:1)
  field: '#FFFFFF', // borda dos campos (Figma: 1 px branco, raio 10)
  tabBar: '#5A5577', // barra inferior (Figma: Rectangle 8)
  muted: '#B3A9EB', // Maximum Blue Purple
  text: '#FFFFFF',
  textMuted: '#B3A9EB',
  textMutedOnSurface: '#D9D3FA', // texto secundário sobre surface/cartões claros (contraste 4.5:1)
  border: 'rgba(179, 169, 235, 0.25)',
  badge: '#685EFF', // bolinha de notificações não lidas (roxo do app)
  danger: '#FF788C', // contraste 4.5:1 no fundo
  success: '#5BD69A',
  warning: '#FFC266',
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
