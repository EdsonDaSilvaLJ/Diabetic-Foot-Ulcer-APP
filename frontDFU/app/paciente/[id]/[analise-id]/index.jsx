import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getFirebaseToken } from '../../../../config/firebase';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../../../constants/Colors';
import API_CONFIG, { buildURL } from '../../../../config/api';

import { LoadingInit } from '../../../../components/LoadingStates';
import { PrimaryButton } from '../../../../components/Buttons';

const { width } = Dimensions.get('window');

export default function DetalhesAnalise() {
  const { 'analise-id': analiseId } = useLocalSearchParams();
  const [analise, setAnalise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (analiseId) {
      buscarDetalhesAnalise();
    } else {
      Alert.alert("Erro", "ID da análise não encontrado.");
      setLoading(false);
    }
  }, [analiseId]);

  const buscarDetalhesAnalise = async () => {
    // Não seta loading se for só um refresh
    if (!refreshing) {
      setLoading(true);
    }
    try {
      const token = await getFirebaseToken();
      
      const url = buildURL(API_CONFIG.ENDPOINTS.ANALISE_DETALHADA_BY_ID(analiseId));
      console.log(`Buscando dados de: ${url}`);
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const responseBody = await response.text(); // Lê como texto primeiro para evitar erro de JSON
      if (!response.ok) {
        console.error("Erro do servidor:", responseBody);
        throw new Error(`Erro ${response.status}: Falha ao buscar dados`);
      }

      const data = JSON.parse(responseBody);
      
      if (data.success && data.data) {
        setAnalise(data.data);
      } else {
        throw new Error(data.message || 'Resposta da API inválida ou sem dados');
      }

    } catch (error) {
      console.error('Erro detalhado ao buscar análise:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados da análise.');
      setAnalise(null); // Limpa o estado para exibir a tela de erro corretamente
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    buscarDetalhesAnalise();
  };

  const formatarDataCompleta = (data) => {
    if (!data) return 'Data indisponível';
    return new Date(data).toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatarData = (data) => {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatarHora = (data) => {
    if (!data) return '-';
    return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // RENDERIZAÇÃO CONDICIONAL
  if (loading) {
    return <LoadingInit />;
  }

  // Se, após o loading, a análise for nula, mostra a tela de erro.
  // Isso previne o crash.
  if (!analise) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorText}>Análise não encontrada</Text>
          <PrimaryButton title="Voltar" onPress={() => router.back()} style={styles.errorButton} />
        </View>
      </SafeAreaView>
    );
  }

  // Se chegamos aqui, 'analise' DEFINITIVAMENTE existe.
  // Agora é seguro declarar as variáveis.
  const paciente = analise.pacienteId;
  const calcularEstatisticas = () => {
    if (!analise.boxes || analise.boxes.length === 0) {
      return { totalDeteccoes: 0, mediaConfianca: 0, classificacoes: {} };
    }
    const totalDeteccoes = analise.boxes.length;
    const somaConfianca = analise.boxes.reduce((soma, box) => soma + (box.classification?.confidence || 0), 0);
    const mediaConfianca = totalDeteccoes > 0 ? somaConfianca / totalDeteccoes : 0;
    const classificacoes = analise.boxes.reduce((acc, box) => {
      const label = box.classification?.label || 'Não classificado';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return { totalDeteccoes, mediaConfianca, classificacoes };
  };
  const { totalDeteccoes, mediaConfianca, classificacoes } = calcularEstatisticas();


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><MaterialIcons name="arrow-back" size={24} color={COLORS.text.primary} /></TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Análise Detalhada</Text>
          <Text style={styles.headerSubtitle}>{paciente?.nome || 'Paciente não identificado'}</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}><MaterialIcons name="refresh" size={24} color={COLORS.text.primary} /></TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
      >
        <View style={styles.imageCard}>
          <Image source={{ uri: analise.originalImageUrl }} style={styles.mainImage} resizeMode="contain" />
          <Text style={styles.imageCaption}>Analisada em {formatarDataCompleta(analise.createdAt)}</Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <MaterialIcons name="analytics" size={24} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Resumo da Análise</Text>
          </View>
          <View style={styles.summaryContent}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total de Detecções:</Text><Text style={styles.summaryValue}>{totalDeteccoes}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Confiança Média:</Text><Text style={styles.summaryValue}>{Math.round(mediaConfianca * 100)}%</Text></View>
            <View style={styles.classificationsContainer}>
              <Text style={styles.classificationsTitle}>Classificações:</Text>
              {Object.keys(classificacoes).length > 0 ? Object.entries(classificacoes).map(([tipo, quantidade]) => (
                <View key={tipo} style={styles.classificationItem}>
                  <View style={styles.classificationDot} />
                  <Text style={styles.classificationType}>{tipo}</Text>
                  <Text style={styles.classificationCount}>({quantidade})</Text>
                </View>
              )) : <Text style={styles.noDetections}>Nenhuma</Text>}
            </View>
          </View>
        </View>

        <View style={styles.detectionsCard}>
          <View style={styles.detectionsHeader}>
            <MaterialIcons name="grid-view" size={24} color={COLORS.info} />
            <Text style={styles.cardTitle}>Detecções da IA</Text>
          </View>
          {analise.boxes && analise.boxes.length > 0 ? (
            <View style={styles.detectionsList}>
              {analise.boxes.map((box, index) => (
                <View key={box._id || index} style={styles.detectionItem}>
                  <View style={styles.detectionContent}>
                    {box.subimagem ? (
                      <View style={styles.subImageContainer}>
                        <Image source={{ uri: `data:image/jpeg;base64,${box.subimagem}` }} style={styles.subImage} />
                      </View>
                    ) : <View style={styles.subImageContainer} /> /* Placeholder */}
                    <View style={styles.detectionDetails}>
                      <View style={styles.detectionHeader}>
                        <Text style={styles.detectionTitle}>Região {index + 1}</Text>
                        <Text style={styles.detectionConfidence}>{Math.round((box.classification?.confidence || 0) * 100)}%</Text>
                      </View>
                      <Text style={styles.detectionClass}>{box.classification?.label || 'Não classificado'}</Text>
                    </View>
                  </View>
                  {box.diagnosis && (
                    <View style={styles.diagnosisContainer}>
                      <Text style={styles.diagnosisLabel}>Diagnóstico Médico:</Text>
                      <Text style={styles.diagnosisText}>{box.diagnosis}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (<Text style={styles.noDetections}>Nenhuma detecção encontrada</Text>)}
        </View>

        <View style={styles.diagnosisCard}>
          <View style={styles.diagnosisCardHeader}>
            <MaterialIcons name="local-hospital" size={24} color={COLORS.success} />
            <Text style={styles.cardTitle}>Diagnóstico Geral</Text>
          </View>
          <Text style={styles.generalDiagnosis}>{analise.imageDiagnosis}</Text>
        </View>

        <View style={styles.technicalCard}>
          <Text style={styles.cardTitle}>Informações Técnicas</Text>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>ID da Análise:</Text><Text style={styles.technicalValue}>{analise._id}</Text></View>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>Data de Criação:</Text><Text style={styles.technicalValue}>{formatarData(analise.createdAt)} às {formatarHora(analise.createdAt)}</Text></View>
          <View style={styles.technicalRow}><Text style={styles.technicalLabel}>Última Atualização:</Text><Text style={styles.technicalValue}>{formatarData(analise.updatedAt)} às {formatarHora(analise.updatedAt)}</Text></View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { padding: SPACING.sm },
  headerInfo: { flex: 1, marginHorizontal: SPACING.md },
  headerTitle: { ...TYPOGRAPHY.heading3, fontWeight: '600', color: COLORS.text.primary, textAlign: 'center' },
  headerSubtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, textAlign: 'center', marginTop: 2 },
  refreshButton: { padding: SPACING.sm },
  content: { flex: 1, paddingHorizontal: SPACING.lg },
  imageCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.large, padding: SPACING.lg, marginTop: SPACING.lg, alignItems: 'center', elevation: 2 },
  mainImage: { width: width - (SPACING.lg * 4), height: 300, borderRadius: BORDER_RADIUS.medium },
  imageCaption: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, textAlign: 'center', marginTop: SPACING.md },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.large, padding: SPACING.xl, marginTop: SPACING.lg, elevation: 2 },
  detectionsCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.large, padding: SPACING.xl, marginTop: SPACING.lg, elevation: 2 },
  diagnosisCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.large, padding: SPACING.xl, marginTop: SPACING.lg, elevation: 2 },
  technicalCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.large, padding: SPACING.xl, marginTop: SPACING.lg, elevation: 2 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  detectionsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  diagnosisCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  cardTitle: { ...TYPOGRAPHY.heading3, fontWeight: '600', color: COLORS.text.primary, marginLeft: SPACING.sm, flex: 1 },
  summaryContent: { gap: SPACING.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
  summaryValue: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.primary },
  classificationsContainer: { marginTop: SPACING.sm },
  classificationsTitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginBottom: SPACING.sm },
  classificationItem: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs },
  classificationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginRight: SPACING.sm },
  classificationType: { ...TYPOGRAPHY.body, color: COLORS.text.primary, flex: 1 },
  classificationCount: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
  detectionsList: { gap: SPACING.md },
  detectionItem: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.medium, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  detectionContent: { flexDirection: 'row', alignItems: 'center' },
  subImageContainer: { width: 60, height: 60, borderRadius: BORDER_RADIUS.small, overflow: 'hidden', marginRight: SPACING.md, backgroundColor: '#f0f0f0' },
  subImage: { width: '100%', height: '100%' },
  detectionDetails: { flex: 1 },
  detectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  detectionTitle: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.text.primary },
  detectionConfidence: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '600' },
  detectionClass: { ...TYPOGRAPHY.body, color: COLORS.info },
  diagnosisContainer: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  diagnosisLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.xs },
  diagnosisText: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 20 },
  noDetections: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, textAlign: 'center', fontStyle: 'italic' },
  generalDiagnosis: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 22 },
  technicalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  technicalLabel: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },
  technicalValue: { ...TYPOGRAPHY.caption, color: COLORS.text.primary, fontWeight: '500', flex: 1, textAlign: 'right' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  errorText: { ...TYPOGRAPHY.heading3, color: COLORS.error, marginTop: SPACING.lg, marginBottom: SPACING.xl, textAlign: 'center' },
  errorButton: { minWidth: 120 },
  bottomSpacer: { height: SPACING.xl },
});