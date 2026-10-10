// Na Web, a sessão fica no localStorage do navegador (não existe cofre do sistema).
// Não importe o expo-sqlite aqui: a versão Web dele precisa de WebAssembly e de um
// Web Worker, e o Metro falha com "Worker chunk not found".
export function createSessionStorage() {
  // Na renderização estática da Web (Node) não existe localStorage.
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}
