import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import API_CONFIG, { buildURL } from '../../../../config/api';
import { getFirebaseToken } from '../../../../config/firebase';
import * as FileSystem from 'expo-file-system';

export default function NovaAnaliseIndex() {
  const { id: pacienteId } = useLocalSearchParams();

  const [originalImageUri, setOriginalImageUri] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTakePhoto = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão Negada', 'É necessário permitir o acesso à câmera para tirar uma foto.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setOriginalImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Erro ao abrir câmera:', error);
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  };

  const handleChooseFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão Negada', 'É necessário permitir o acesso à galeria para escolher uma imagem.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setOriginalImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Erro ao abrir galeria:', error);
      Alert.alert('Erro', 'Não foi possível abrir a galeria de imagens.');
    }
  };

  const handleDetectUlcers = async () => {
    if (!originalImageUri) {
      Alert.alert('Erro', 'Nenhuma imagem selecionada');
      return;
    }

    setIsProcessing(true);

    try {
      console.log('🚀 ===== INÍCIO DA DETECÇÃO =====');
      console.log('📋 BASE_URL:', API_CONFIG.BASE_URL);
      console.log('📋 ENDPOINT:', API_CONFIG.ENDPOINTS.DETECT_ULCERS);

      // ✅ TESTE 1: Health check (SEM timeout property)
      console.log('🧪 TESTE 1: Verificando /health...');
      const healthUrl = `${API_CONFIG.BASE_URL}/health`;
      console.log('🌐 URL health:', healthUrl);
      
      const healthResponse = await fetch(healthUrl, {
        method: 'GET',
      });
      
      console.log('✅ Status /health:', healthResponse.status);
      
      if (!healthResponse.ok) {
        throw new Error('Backend não está respondendo no /health');
      }
      
      const healthData = await healthResponse.json();
      console.log('✅ Backend online:', healthData.service);

      // ✅ TESTE 2: Construir URL
      const url = buildURL(API_CONFIG.ENDPOINTS.DETECT_ULCERS);
      console.log('🌐 URL detecção:', url);

      // ✅ TESTE 3: Preparar FormData (método correto para React Native)
      console.log('📦 Preparando FormData...');
      
      // Método 1: Tentar com URI direto
      const formData = new FormData();
      
      // React Native precisa de 'name' dentro do objeto
      const fileData = {
        uri: originalImageUri,
        type: 'image/jpeg',
        name: 'ulcera_original.jpg',
      };
      
      console.log('📄 Dados do arquivo:', fileData);
      formData.append('file', fileData);
      console.log('✅ FormData criado');

      // ✅ TESTE 4: Obter token (opcional)
      let token = null;
      try {
        token = await getFirebaseToken();
        console.log('🔑 Token Firebase:', token ? 'Obtido' : 'Não disponível');
      } catch (tokenError) {
        console.warn('⚠️ Erro ao obter token:', tokenError.message);
      }

      // ✅ TESTE 5: Enviar requisição com headers explícitos
      console.log('📤 Enviando requisição POST...');
      console.log('📤 Para URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: formData,
      });

      console.log('📊 Status HTTP:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Resposta de erro:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Resposta recebida:', {
        success: data.success,
        boxes: data.boxes?.length || 0,
        hasImage: !!data.imagem_redimensionada
      });

      // Processar resposta
      if (data.success) {
        if (data.imagem_redimensionada && data.boxes && data.boxes.length > 0) {
          console.log(`✅ ${data.boxes.length} úlceras detectadas! Navegando...`);
          router.push({
            pathname: `/paciente/${pacienteId}/nova-analise/edit-regions`,
            params: {
              id: pacienteId,
              imageBase64: data.imagem_redimensionada,
              boxes: JSON.stringify(data.boxes),
              imageInfo: JSON.stringify(data.dimensoes || {}),
              originalUri: originalImageUri,
            },
          });
        } else {
          console.log('⚠️ Nenhuma úlcera detectada');
          Alert.alert(
            'Resultado',
            'Nenhuma úlcera foi detectada na imagem.',
            [
              { text: 'Escolher Outra', onPress: () => setOriginalImageUri(null) },
              {
                text: 'Prosseguir Mesmo Assim',
                onPress: async () => {
                  try {
                    const imageBase64 = await FileSystem.readAsStringAsync(originalImageUri, {
                      encoding: 'base64',
                    });

                    const imageDimensions = await new Promise((resolve, reject) => {
                      Image.getSize(originalImageUri, (width, height) => {
                        resolve({ width, height });
                      }, reject);
                    });

                    const mockApiDimensions = {
                      original_size: imageDimensions,
                      resized_size: imageDimensions,
                      final_size: imageDimensions,
                      padding: { x: 0, y: 0 },
                      scale_factor: 1
                    };

                    router.push({
                      pathname: `/paciente/${pacienteId}/nova-analise/edit-regions`,
                      params: {
                        id: pacienteId,
                        imageBase64: imageBase64,
                        boxes: JSON.stringify([]),
                        imageInfo: JSON.stringify(mockApiDimensions),
                        originalUri: originalImageUri,
                      },
                    });
                  } catch (e) {
                    console.error("Erro ao processar imagem:", e);
                    Alert.alert("Erro", "Não foi possível carregar a imagem.");
                  }
                }
              }
            ]
          );
        }
      } else {
        throw new Error(data.message || 'Falha na detecção');
      }

    } catch (error) {
      console.error('❌ ===== ERRO CAPTURADO =====');
      console.error('❌ Nome:', error.name);
      console.error('❌ Mensagem:', error.message);
      console.error('❌ Stack:', error.stack);

      let errorMessage = 'Erro desconhecido';
      let errorTitle = 'Erro na Detecção';

      if (error.message.includes('Network request failed')) {
        errorTitle = 'Erro de Conexão';
        errorMessage = `Não foi possível conectar ao servidor.\n\n` +
          `Verifique:\n` +
          `• Celular está no Wi-Fi correto\n` +
          `• Endereço: ${API_CONFIG.BASE_URL}\n` +
          `• Servidor está rodando`;
      } else if (error.message.includes('Backend não está respondendo')) {
        errorTitle = 'Servidor Offline';
        errorMessage = `O servidor não está respondendo.\n\nVerifique se o backend está rodando.`;
      } else if (error.message.includes('HTTP')) {
        errorTitle = 'Erro do Servidor';
        errorMessage = error.message;
      } else {
        errorMessage = error.message;
      }

      Alert.alert(
        errorTitle,
        errorMessage,
        [
          { text: 'Tentar Novamente', onPress: () => handleDetectUlcers() },
          { text: 'Escolher Outra', onPress: () => setOriginalImageUri(null) },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangeImage = () => {
    setOriginalImageUri(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nova Análise</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {originalImageUri ? (
          <>
            <View style={styles.imageContainer}>
              <Image source={{ uri: originalImageUri }} style={styles.capturedImage} />
              <TouchableOpacity style={styles.retakeButton} onPress={handleChangeImage}>
                <Ionicons name="image-outline" size={20} color="#fff" />
                <Text style={styles.retakeText}>Trocar Imagem</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsTitle}>Imagem Selecionada!</Text>
              <Text style={styles.instructionsText}>
                Clique em Segmentar Úlceras para iniciar a análise automática da imagem.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.segmentButton, isProcessing && styles.segmentButtonDisabled]}
              onPress={handleDetectUlcers}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.segmentButtonText}>Analisando...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="scan" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.segmentButtonText}>Segmentar Úlceras</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.selectionContainer}>
            <Ionicons name="image" size={80} color="#2196F3" />
            <Text style={styles.selectionTitle}>Iniciar Análise</Text>
            <Text style={styles.selectionText}>
              Escolha uma imagem da galeria ou tire uma nova foto para começar.
            </Text>

            <TouchableOpacity style={styles.selectionButton} onPress={handleTakePhoto}>
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={styles.selectionButtonText}>Tirar Foto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.selectionButton, styles.galleryButton]} onPress={handleChooseFromGallery}>
              <Ionicons name="images" size={24} color="#fff" />
              <Text style={styles.selectionButtonText}>Escolher da Galeria</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingTitle}>Detectando Úlceras...</Text>
            <Text style={styles.loadingSubtext}>
              Nossa IA está analisando a imagem para identificar regiões de interesse.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  imageContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  capturedImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 12,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c757d',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'center',
  },
  retakeText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  instructionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  segmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 20,
  },
  segmentButtonDisabled: {
    backgroundColor: '#999',
  },
  segmentButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  selectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  selectionText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  selectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    marginBottom: 16,
  },
  galleryButton: {
    backgroundColor: '#17a2b8',
  },
  selectionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginHorizontal: 32,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});