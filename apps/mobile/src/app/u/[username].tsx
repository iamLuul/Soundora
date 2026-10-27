import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ProfileView } from '../../components/ProfileView';

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: `@${username}` }} />
      <ProfileView username={username} />
    </View>
  );
}
