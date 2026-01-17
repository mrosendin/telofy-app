import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@/lib/hooks/useAuth';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signUp, isLoading, error, clearError } = useAuth();

  // Clear any previous errors when screen mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSignUp = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    const result = await signUp(email.trim(), password, name.trim());
    if (result.success) {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-telofy-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 px-6 pt-8">
            {/* Header */}
            <View className="items-center mb-8">
              <Text 
                className="text-telofy-accent text-5xl tracking-tight"
                style={{ fontStyle: 'italic', fontWeight: '300' }}
              >
                telofy
              </Text>
              <Text className="text-telofy-text-secondary mt-2 text-sm tracking-widest uppercase">
                Turn intention into execution
              </Text>
            </View>

            {/* Form */}
            <View className="mb-8">
              <Text className="text-telofy-text text-2xl font-bold mb-6">
                Create Account
              </Text>

              {error && (
                <View className="bg-telofy-error/20 border border-telofy-error rounded-xl p-4 mb-6">
                  <Text className="text-telofy-error text-center">{error}</Text>
                </View>
              )}

              <View className="mb-4">
                <Text className="text-telofy-text-secondary text-sm mb-2">Name</Text>
                <TextInput
                  className="text-telofy-text p-4 rounded-xl bg-telofy-surface border border-telofy-border"
                  style={{ textAlignVertical: 'center' }}
                  placeholder="John Doe"
                  placeholderTextColor="#52525b"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>

              <View className="mb-4">
                <Text className="text-telofy-text-secondary text-sm mb-2">Email</Text>
                <TextInput
                  className="text-telofy-text p-4 rounded-xl bg-telofy-surface border border-telofy-border"
                  style={{ textAlignVertical: 'center' }}
                  placeholder="you@example.com"
                  placeholderTextColor="#52525b"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View className="mb-4">
                <Text className="text-telofy-text-secondary text-sm mb-2">Password</Text>
                <View className="relative">
                  <TextInput
                    className="text-telofy-text p-4 pr-12 rounded-xl bg-telofy-surface border border-telofy-border"
                    style={{ textAlignVertical: 'center' }}
                    placeholder="Min 8 characters"
                    placeholderTextColor="#52525b"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable
                    className="absolute right-4 top-4"
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <FontAwesome
                      name={showPassword ? 'eye-slash' : 'eye'}
                      size={20}
                      color="#52525b"
                    />
                  </Pressable>
                </View>
              </View>

              <View className="mb-6">
                <Text className="text-telofy-text-secondary text-sm mb-2">
                  Confirm Password
                </Text>
                <TextInput
                  className="text-telofy-text p-4 rounded-xl bg-telofy-surface border border-telofy-border"
                  style={{ textAlignVertical: 'center' }}
                  placeholder="••••••••"
                  placeholderTextColor="#52525b"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>

              <Pressable
                className={`rounded-xl py-4 items-center ${
                  isLoading ? 'bg-telofy-accent/50' : 'bg-telofy-accent'
                }`}
                onPress={handleSignUp}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#0a0a0b" />
                ) : (
                  <Text className="text-telofy-bg font-semibold text-lg">
                    Create Account
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Footer */}
            <View className="items-center">
              <Text className="text-telofy-text-secondary">
                Already have an account?{' '}
                <Link href="/(auth)/sign-in" asChild>
                  <Text className="text-telofy-accent font-semibold">Sign In</Text>
                </Link>
              </Text>
            </View>

            {/* Skip for now */}
            <View className="items-center mt-6 pb-8">
              <Pressable onPress={() => router.replace('/(tabs)')}>
                <Text className="text-telofy-muted text-sm">
                  Continue without account →
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
