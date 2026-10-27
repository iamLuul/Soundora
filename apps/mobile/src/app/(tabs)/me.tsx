import { View } from 'react-native';
import { ProfileView } from '../../components/ProfileView';
import { useAuth } from '../../lib/auth';

/** Aba "Perfil": o banner vai até o topo (sem cabeçalho). Idioma, senha, @ e sair ficam em Configurações (menu ⋮). */
export default function MyProfileScreen() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <View style={{ flex: 1 }}>
      <ProfileView username={profile.username} underStatusBar />
    </View>
  );
}
