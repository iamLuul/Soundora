import { Platform, type ViewStyle } from 'react-native';

/**
 * Tokens visuais do Soundhora, tirados do guia visual da pesquisa:
 * Montserrat, roxo "Blue Genie" #6C62FF e tema escuro.
 */
export const colors = {
  primary: '#685EFF', // Blue Genie (um tom mais escuro: texto branco nos botões com contraste 4.5:1)
  background: '#3A374C', // Plush
  surface: '#5A5577', // The Fang
  card: '#322F42', // cartões do perfil (Figma: Profile page)
  handle: '#C2BEDD', // @usuário, placeholder da busca (contraste 4.5:1 mesmo sobre o vidro e o brilho do fundo)
  placeholder: '#A3A3A3', // texto de exemplo nos campos (clareado para contraste 4.5:1)
  field: '#FFFFFF', // borda dos campos (Figma: 1 px branco, raio 10)
  tabBar: '#5A5577', // barra inferior (Figma: Rectangle 8)
  muted: '#B3A9EB', // Maximum Blue Purple
  text: '#FFFFFF',
  textMuted: '#C4BCF2', // Maximum Blue Purple clareado: 4.5:1 sobre os cartões de vidro
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

export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

/**
 * Vidro (glassmorphism): a tinta é quase transparente e a cor vem do fundo com brilho
 * (`backdrop`) que fica atrás das telas. Na web, o vidro também desfoca o que passa por baixo.
 */
const web = (style: object): ViewStyle => (Platform.OS === 'web' ? (style as ViewStyle) : {});
const RIM = 'inset 0 1px 0 rgba(255,255,255,0.14)';
export const glass = {
  /** Cartões e painéis (perfil, comunidades, configurações). */
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    ...web({ backdropFilter: 'blur(14px) saturate(130%)', boxShadow: `0 10px 30px rgba(10, 6, 30, 0.18), ${RIM}` }),
  } as ViewStyle,
  /** Peças pequenas e repetidas (gêneros, selos, chips): sem desfoque, só a tinta e a borda. */
  chip: { backgroundColor: 'rgba(255, 255, 255, 0.07)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' } as ViewStyle,
  /** Menus e folhas que sobem de baixo: mais opacos, para o texto ficar legível sobre qualquer coisa. */
  sheet: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(46, 43, 64, 0.82)' : '#353247',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    ...web({ backdropFilter: 'blur(22px) saturate(140%)', boxShadow: `0 -10px 40px rgba(0,0,0,0.35), ${RIM}` }),
  } as ViewStyle,
  /** Fundo de um item tocado/apontado dentro de um painel de vidro. */
  pressed: 'rgba(255, 255, 255, 0.08)',
  hover: 'rgba(255, 255, 255, 0.05)',
} as const;

/** Degradês (CSS `linear-gradient`, que o React Native também desenha). */
export const gradients = {
  /** Botões principais: o roxo do Soundhora (texto branco com contraste 4.5:1 em todo o degradê). */
  primary: 'linear-gradient(135deg, #685EFF 0%, #4F45D9 100%)',
  /** Brilho de fundo: três luzes suaves (roxo, rosa e ciano) sobre o "Plush". */
  backdrop: [
    'radial-gradient(circle at 0% 0%, rgba(104, 94, 255, 0.14) 0%, rgba(104, 94, 255, 0) 55%)',
    'radial-gradient(circle at 100% 45%, rgba(253, 81, 99, 0.09) 0%, rgba(253, 81, 99, 0) 50%)',
    'radial-gradient(circle at 10% 100%, rgba(37, 209, 218, 0.08) 0%, rgba(37, 209, 218, 0) 50%)',
  ].join(', '),
  /** Telas com cabeçalho (barra de título lisa): sem a luz de cima, para não marcar uma linha embaixo dele. */
  backdropHeaded: [
    'radial-gradient(circle at 100% 45%, rgba(253, 81, 99, 0.09) 0%, rgba(253, 81, 99, 0) 50%)',
    'radial-gradient(circle at 10% 100%, rgba(37, 209, 218, 0.08) 0%, rgba(37, 209, 218, 0) 50%)',
  ].join(', '),
} as const;

export const text = {
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  subtitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  label: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
} as const;
