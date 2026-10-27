// Ícones da barra lateral do desktop: todos no mesmo desenho (24 x 24, só contorno, pontas
// arredondadas) para a espessura da linha ser igual. O traço é STROKE no desenho e vira 2,5 px na
// tela (veja <StrokeIcon />). A engrenagem é do conjunto Lucide (licença ISC).

export const SIDEBAR_STROKE = 2.5;

export const sidebarIcons = {
  home: `<path d="M4 10.2 12 3.6l8 6.6v9.3a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V21H5.5A1.5 1.5 0 0 1 4 19.5z"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>`,
  bell: `<path d="M6 9.5a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5z"/><path d="M10 19.7a2.2 2.2 0 0 0 4 0"/>`,
  message: `<path d="M21 3 10.2 13.8"/><path d="M21 3l-6.6 18-4.2-7.2L3 9.6z"/>`,
  music: `<path d="M9 17.5V5.5l10-2V15.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>`,
  profile: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/>`,
  settings: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
} as const;

export type SidebarIconName = keyof typeof sidebarIcons;
