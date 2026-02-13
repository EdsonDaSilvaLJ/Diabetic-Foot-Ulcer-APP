// app/(tabs)/home.jsx - VERSÃO CORRIGIDA

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Text
} from 'react-native';
import { useRouter } from 'expo-router';
import { auth, getFirebaseToken } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import { COLORS, SPACING } from '../../constants/Colors';
import API_CONFIG, { buildURL } from '../../config/api';

// ⭐ IMPORTAR COMPONENTES MODERNOS
import { SearchBar } from '../../components/Inputs';
import { PatientCard } from '../../components/Cards';
import { EmptyPatients } from '../../components/EmptyStates';
import { PageHeader, SectionHeader } from '../../components/Headers';
import { LoadingInit } from '../../components/LoadingStates';
import { FloatingActionButton } from '../../components/Buttons';

export default function Home() {
  const [busca, setBusca] = useState('');
  const [pacientesTotais, setPacientesTotais] = useState([]);
  const [pacientesFiltrados, setPacientesFiltrados] = useState([]);
  const [totalPacientes, setTotalPacientes] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const router = useRouter();

  // ✅ VERIFICAÇÃO INICIAL SEM LISTENER
  useEffect(() => {
    console.log('🏠 Home montada, verificando usuário...');
    
    const checkUserAndLoad = async () => {
      try {
        const currentUser = auth.currentUser;
        
        if (!currentUser) {
          console.log('❌ Usuário não encontrado na home, redirecionando...');
          router.replace('/login');
          return;
        }
        
        console.log('✅ Usuário encontrado na home:', {
          uid: currentUser.uid,
          email: currentUser.email
        });
        
        setUser(currentUser);
        await buscarPacientes();
        
      } catch (error) {
        console.error('❌ Erro ao verificar usuário:', error);
        router.replace('/login');
      } finally {
        setCarregando(false);
      }
    };

    checkUserAndLoad();
  }, []);

  const buscarPacientes = async () => {
    try {
      console.log('🔍 Buscando pacientes...');
      
      const token = await getFirebaseToken();
      if (!token) {
        console.log('❌ Sem token, redirecionando para login');
        router.replace('/login');
        return;
      }

      const res = await fetch(
        buildURL(API_CONFIG.ENDPOINTS.PACIENTES),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`HTTP ${res.status}: ${errorData.message || 'Erro no servidor'}`);
      }

      const data = await res.json();
      
      console.log('✅ Pacientes carregados:', {
        total: data.totalPacientes,
        encontrados: data.pacientes?.length || 0
      });
      
      setPacientesTotais(data.pacientes || []);
      setPacientesFiltrados(data.pacientes || []);
      setTotalPacientes(data.totalPacientes || 0);

    } catch (error) {
      console.error('❌ Erro ao buscar pacientes:', error);
      Alert.alert('Erro', 'Não foi possível carregar os pacientes');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await buscarPacientes();
    setRefreshing(false);
  };

  // ✅ FUNÇÃO DE LOGOUT CORRIGIDA
  const handleLogout = () => {
    Alert.alert(
      "Sair da Conta",
      "Você tem certeza que deseja sair?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sair", 
          style: "destructive",
          onPress: async () => {
            try {
              console.log('🚪 Fazendo logout...');
              await signOut(auth);
              console.log('✅ Logout realizado com sucesso');
              
              // ✅ REDIRECIONAMENTO CORRETO
              router.replace('/login');
              
            } catch (error) {
              console.error("❌ Erro ao fazer logout:", error);
              Alert.alert("Erro", "Não foi possível sair. Tente novamente.");
            }
          }
        }
      ]
    );
  };

  const filtrarPacientes = (texto) => {
    const termo = texto.toLowerCase();
    return pacientesTotais.filter(p =>
      (p.nome || '').toLowerCase().includes(termo) ||
      (p.cpf || '').includes(texto)
    );
  };

  const handleBusca = (texto) => {
    setBusca(texto);
    if (texto.trim()) {
      setPacientesFiltrados(filtrarPacientes(texto));
    } else {
      setPacientesFiltrados(pacientesTotais);
    }
  };

  const navegarPerfil = (paciente) => {
    const id = paciente._id ?? paciente.id;
    router.push(`/paciente/${id}`);
  };

  const navegarCadastro = () => {
    router.push('/(tabs)/cadastrar');
  };

  // ✅ LOADING MELHORADO
  if (carregando) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Carregando dados...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ✅ VERIFICAÇÃO DE USUÁRIO
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Redirecionando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <PageHeader
        title="Meus Pacientes"
        subtitle={`Logado como: ${user.email}`} // ← MOSTRAR EMAIL
        actions={[
          {
            icon: 'refresh',
            onPress: handleRefresh
          },
          {
            icon: 'logout',
            onPress: handleLogout
          }
        ]}
      />

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <SearchBar
            value={busca}
            onChangeText={handleBusca}
            placeholder="Buscar por nome ou CPF..."
          />
        </View>

        <SectionHeader
          title="Pacientes"
          count={busca.trim() ? pacientesFiltrados.length : totalPacientes}
        />

        {pacientesFiltrados.length > 0 ? (
          <FlatList
            data={pacientesFiltrados}
            keyExtractor={item => item._id ?? item.id}
            renderItem={({ item }) => (
              <PatientCard
                patient={item}
                onPress={() => navegarPerfil(item)}
                showAnalysisCount={true}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
          />
        ) : (
          <EmptyPatients onAddPatient={navegarCadastro} />
        )}
      </View>
      
      <FloatingActionButton
        onPress={navegarCadastro}
        icon="person-add"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  searchContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: SPACING.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  listContent: {
    paddingBottom: SPACING.xxl,
  },
  // ✅ NOVOS ESTILOS PARA LOADING
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});