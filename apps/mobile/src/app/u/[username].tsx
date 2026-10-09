import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ProfileView } from '../../components/ProfileView';
import { colors } from '../../theme';

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: `@${username}` }} />
      <ProfileView username={username} />
    </View>
  );
}
