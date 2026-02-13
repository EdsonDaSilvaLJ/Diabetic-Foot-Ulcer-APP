// --- Use este código para o seu arquivo: results.jsx ---

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Image, Alert, StyleSheet, ScrollView, TextInput, ActivityIndicator, Dimensions
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { auth } from '../../../../config/firebase';
import API_CONFIG, { buildURL } from '../../../../config/api';
import * as FileSystem from 'expo-file-system';

const { width: screenWidth } = Dimensions.get('window');

export default function ResultsScreen() {
  const params = useLocalSearchParams();
  const pacienteId = params.id;
  const detectedImageBase64 = params.imageBase64;
  const boxes = params.boxes ? JSON.parse(params.boxes) : [];
  const imageInfo = params.imageInfo ? JSON.parse(params.imageInfo) : {};
  const originalUri = params.originalUri;

  const [isProcessing, setIsProcessing] = useState(true);
  const [classificacoes, setClassificacoes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      diagnosticoGeral: '',
      observacoes: {},
    }
  });

  useEffect(() => {
    handleProceedToClassification();
  }, []);

  const handleProceedToClassification = async () => {
    setIsProcessing(true);
    try {
      const classificacaoData = {
        imagem_redimensionada: detectedImageBase64,
        boxes_finais: boxes,
        medico_id: auth.currentUser?.uid,
        paciente_id: pacienteId,
      };

      const response = await fetch(buildURL(API_CONFIG.ENDPOINTS.CLASSIFY_REGIONS), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classificacaoData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();

      if (data.success && data.resultados_classificacao) {
        setClassificacoes(data.resultados_classificacao);
      } else {
        throw new Error(data.message || 'Falha na classificação das regiões');
      }
    } catch (error) {
      console.error('Erro na classificação:', error);
      Alert.alert('Erro na Classificação', 'Não foi possível classificar as regiões. Tente novamente.',
        [{ text: 'Tentar Novamente', onPress: handleProceedToClassification }, { text: 'Voltar', onPress: () => router.back() }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveAnalysis = async (formData) => {
    setIsSaving(true);
    try {
      let originalImageBase64 = '';
      if (originalUri) {
        originalImageBase64 = await FileSystem.readAsStringAsync(originalUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        originalImageBase64 = detectedImageBase64;
      }

      const analiseData = {
        medico_id: auth.currentUser?.uid,
        paciente_id: pacienteId,
        imagem_original: originalImageBase64,
        regioes_analisadas: classificacoes.map((regiao, index) => ({
          coordenadas: {
            xmin: regiao.xmin, ymin: regiao.ymin,
            xmax: regiao.xmax, ymax: regiao.ymax
          },
          classificacao_ia: {
            classe: regiao.classe_classificacao,
            confianca: regiao.confianca_classificacao
          },
          diagnostico_medico: formData.observacoes?.[index] || ''
        })),
        diagnostico_geral: formData.diagnosticoGeral
      };

      const url = buildURL(API_CONFIG.ENDPOINTS.SAVE_ANALYSIS);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(auth.currentUser && { 'Authorization': `Bearer ${await auth.currentUser.getIdToken()}` })
        },
        body: JSON.stringify(analiseData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
        Alert.alert('Sucesso!', 'Análise salva com sucesso',
          [{ text: 'OK', onPress: () => router.replace(`/paciente/${pacienteId}`) }]
        );
      } else {
        throw new Error(data.message || 'Erro ao salvar análise');
      }
    } catch (error) {
      console.error('Erro detalhado ao salvar análise:', error);
      Alert.alert('Erro', `Não foi possível salvar a análise.\n\n${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getClassificationColor = (confianca) => {
    if (confianca >= 0.8) return '#4CAF50';
    if (confianca >= 0.6) return '#FF9800';
    return '#f44336';
  };

  const getClassificationText = (confianca) => {
    if (confianca >= 0.8) return 'Alta';
    if (confianca >= 0.6) return 'Média';
    return 'Baixa';
  };

  if (isProcessing && classificacoes.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingTitle}>Classificando Regiões...</Text>
        <Text style={styles.loadingText}>Nossa IA está analisando cada região identificada...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Resultados da Análise</Text>
        <View style={styles.placeholder} />
      </View>
      <ScrollView style={styles.content}>
        <View style={styles.imageSection}>
          <Text style={styles.sectionTitle}>Imagem Analisada</Text>
          <View style={styles.imageContainer}>
            <Image source={{ uri: `data:image/jpeg;base64,${detectedImageBase64}` }} style={styles.mainImage} resizeMode="contain" />
          </View>
          <Text style={styles.imageInfo}>Regiões analisadas: {classificacoes.length}</Text>
        </View>

        <View style={styles.resultsSection}>
          <Text style={styles.sectionTitle}>Classificações da IA</Text>
          {classificacoes.map((regiao, index) => (
            <View key={index} style={styles.resultItem}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>Região {index + 1}</Text>
                <View style={[styles.confidenceBadge, { backgroundColor: getClassificationColor(regiao.confianca_classificacao) }]}>
                  <Text style={styles.confidenceText}>{getClassificationText(regiao.confianca_classificacao)}</Text>
                </View>
              </View>
              <View style={styles.resultContent}>
                <View style={styles.subImageContainer}>
                  <Image source={{ uri: `data:image/jpeg;base64,${regiao.subimagem}` }} style={styles.subImage} resizeMode="cover" />
                </View>
                <View style={styles.classificationInfo}>
                  <Text style={styles.classificationLabel}>Classificação:</Text>
                  <Text style={styles.classificationType}>{regiao.classe_classificacao}</Text>
                  <Text style={styles.classificationLabel}>Confiança:</Text>
                  <Text style={styles.classificationConfidence}>{(regiao.confianca_classificacao * 100).toFixed(1)}%</Text>
                </View>
              </View>
              <View style={styles.observationSection}>
                <Text style={styles.observationLabel}>Observação do Médico:</Text>
                <Controller
                  control={control}
                  name={`observacoes.${index}`}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput style={styles.observationInput} placeholder="Adicione suas observações..." multiline value={value} onBlur={onBlur} onChangeText={onChange} />
                  )}
                />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.diagnosisSection}>
          <Text style={styles.sectionTitle}>Diagnóstico Geral*</Text>
          <Controller
            control={control}
            name="diagnosticoGeral"
            rules={{ required: 'Diagnóstico geral é obrigatório' }}
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput style={[styles.diagnosisInput, errors.diagnosticoGeral && styles.inputError]} placeholder="Digite o diagnóstico geral da análise..." multiline value={value} onBlur={onBlur} onChangeText={onChange} />
            )}
          />
          {errors.diagnosticoGeral && (<Text style={styles.errorText}>{errors.diagnosticoGeral.message}</Text>)}
        </View>
      </ScrollView>

      <View style={styles.bottomSection}>
        <TouchableOpacity style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={handleSubmit(handleSaveAnalysis)} disabled={isSaving}>
          {isSaving ? (
            <><ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /><Text style={styles.saveButtonText}>Salvando...</Text></>
          ) : (
            <><Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} /><Text style={styles.saveButtonText}>Salvar Análise</Text></>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', paddingHorizontal: 32 },
  loadingTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
  loadingText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  placeholder: { width: 40 },
  content: { flex: 1 },
  imageSection: { backgroundColor: '#fff', margin: 16, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  imageContainer: { alignItems: 'center', marginBottom: 8 },
  mainImage: { width: screenWidth - 64, height: (screenWidth - 64) * 0.75, borderRadius: 8 },
  imageInfo: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 4 },
  resultsSection: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16 },
  resultItem: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 12, marginBottom: 16 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  resultTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  confidenceBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  confidenceText: { fontSize: 12, color: '#fff', fontWeight: '500' },
  resultContent: { flexDirection: 'row', marginBottom: 12 },
  subImageContainer: { marginRight: 12 },
  subImage: { width: 80, height: 80, borderRadius: 6 },
  classificationInfo: { flex: 1 },
  classificationLabel: { fontSize: 12, color: '#666', marginBottom: 2 },
  classificationType: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  classificationConfidence: { fontSize: 13, color: '#4CAF50', marginBottom: 6 },
  observationSection: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 12 },
  observationLabel: { fontSize: 13, color: '#333', marginBottom: 8 },
  observationInput: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 6, padding: 8, fontSize: 14, textAlignVertical: 'top', minHeight: 60 },
  diagnosisSection: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16 },
  diagnosisInput: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 6, padding: 12, fontSize: 14, textAlignVertical: 'top', minHeight: 80 },
  inputError: { borderColor: '#f44336' },
  errorText: { fontSize: 12, color: '#f44336', marginTop: 4 },
  bottomSection: { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', paddingVertical: 16, borderRadius: 12 },
  saveButtonDisabled: { backgroundColor: '#999' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});