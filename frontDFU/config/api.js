const API_CONFIG = {
  BASE_URL: "http://10.13.20.25:3000", // Backend local na rede LAN

  ENDPOINTS: {
    SIGNUP: '/logup',
    PACIENTES: "/pacientes",
    PACIENTE_BY_ID: (id) => `/pacientes/${id}`,
    UPLOAD_FOTO: '/pacientes/upload-foto',
    SALVAR_AVALIACAO: "/pacientes/salvar-avaliacao",
    PROFISSIONAL_PROFILE: '/profissionais/profile',
    ANALISE_BY_ID: (id) => `/analises/${id}`,
    ANALISE_DETALHADA_BY_ID: (id) => `/api/analise-detalhada/${id}`,

    // ⭐ ADICIONAR ENDPOINTS DA IA
  DETECT_REGIONS: '/api/detect-ulcers',
  // alias para compatibilidade
  DETECT_ULCERS: '/api/detect-ulcers',
    CLASSIFY_REGIONS: '/api/classify-regions',
    SAVE_ANALYSIS: '/api/save-analysis',
  },
  
  TIMEOUT: 120000, // 2 minutos para IA
  DEBUG: __DEV__,

};

// Função helper para construir URLs completas
export const buildURL = (endpoint) => {
  console.log(`${API_CONFIG.BASE_URL}${endpoint}`)
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

export const makeAuthenticatedRequest = async (url, options = {}, token) => {
  const isFormData = options?.body instanceof FormData;
  const headers = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(!isFormData && options?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers || {}),
  };

  console.log('📡 Fazendo requisição:', {
    url,
    method: options.method || 'GET',
    hasToken: !!token,
    bodyType: isFormData ? 'FormData' : typeof options.body,
  });

  return fetch(url, { ...options, headers });
};

export const postFormData = async (endpoint, formData, token) => {
  const url = buildURL(endpoint);
  return fetch(url, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: formData,
  });
};

// Função helper para requisições com FormData (upload de arquivos)
export const makeFormDataRequest = async (url, formData, token) => {
  return fetch(url, {
    method: 'POST',
    headers: {
      // NÃO definir Content-Type para FormData - o browser faz automaticamente
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    body: formData
  });
};

export default API_CONFIG;
//ainda n implementadopowe