// Android e iOS não têm localStorage: o expo-sqlite cria um, usado pelo Supabase para guardar a sessão.
import 'expo-sqlite/localStorage/install';
