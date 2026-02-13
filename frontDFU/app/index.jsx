// app/index.jsx - VERSÃO COM onAuthStateChanged para controle robusto de autenticação

import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth'; // <--- Importe onAuthStateChanged

export default function IndexPage() {
  useEffect(() => {
    console.log('🚀 App iniciando e configurando listener de autenticação...');

    // ⭐ USAR onAuthStateChanged para escutar mudanças no estado de autenticação
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔍 onAuthStateChanged detectou mudança:', {
        hasUser: !!user,
        uid: user?.uid,
        email: user?.email // Adicionado para mais detalhes no log
      });

      if (user) {
        console.log('✅ Usuário logado, redirecionando para home.');
        // ✅ Redirecionamento correto para o grupo de abas e tela home
        router.replace('/(tabs)/home'); 
      } else {
        console.log('❌ Usuário não logado, redirecionando para login.');
        router.replace('/login');
      }
    });

    // ⭐ Limpa o listener quando o componente é desmontado para evitar vazamentos de memória
    return () => unsubscribe();
  }, []); // O array de dependências vazio garante que o efeito rode apenas uma vez na montagem

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={{ marginTop: 16, fontSize: 16, color: '#666' }}>
        Verificando status de autenticação...
      </Text>
    </View>
  );
}