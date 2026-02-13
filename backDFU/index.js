const cors = require('cors');
const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer'); // Para upload de arquivos
const { admin, getBucket } = require('./config/firebase');
const MONGO_URI = process.env.MONGO_URI;
const { default: sharp } = require('sharp'); // Você precisará instalar o 'sharp'
const { Readable } = require('stream');

// Módulos para requisições HTTP e manipulação de arquivos
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const stream = require('stream'); // Necessário para criar o stream do buffer


// Importar modelos
const Analise = require('./models/Analise');
const Profissional = require('./models/Profissional');
const Paciente = require('./models/Paciente');

// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config({ path: './.env' });

const app = express();
// Railway define a porta automaticamente através da variável PORT
const port = process.env.PORT || 3000;


// ⭐ MIDDLEWARES PRIMEIRO - ORDEM CRÍTICA
app.use(cors({
    origin: '*', // Para desenvolvimento
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' })); // ⭐ ANTES DAS ROTAS
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Log middleware para debug
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path}`);
    console.log('📦 Body:', req.body ? 'Presente' : 'Ausente');
    console.log('🔑 Auth:', req.headers.authorization ? 'Presente' : 'Ausente');
    next();
});

// Teste Firebase
console.log('🔥 Testando Firebase Admin...');
try {
    const authService = admin.auth();
    console.log('✅ Firebase Admin funcionando:', typeof authService);
} catch (error) {
    console.error('❌ Firebase Admin com erro:', error.message);
}


// Conectar ao MongoDB Atlas
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
    .catch((err) => console.error('❌ Erro na conexão:', err));


// Importação das rotas
const pacienteRoute = require('./routes/pacienteRoute');
const logupRoute = require('./routes/logupRoute');
const profissionalRoutes = require('./routes/profissionalRoute');

app.use('/pacientes', pacienteRoute);
app.use('/logup', logupRoute);
app.use('/profissionais', profissionalRoutes);


// Configuração do multer para upload de arquivos (em memória para Railway)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Limite de 10MB
    }
});


// URL base da API Python (hardcoded para IP da LAN)
const PYTHON_API_BASE_URL = 'http://10.13.20.25:8001';



// ✅ TESTAR CONEXÃO NO STARTUP
const testarPythonAPI = async () => {
  try {
    console.log('🧪 Testando conectividade com Python API...');
    const response = await axios.get(`${PYTHON_API_BASE_URL}/health`, { timeout: 5000 });
    
    if (response.status === 200) {
      console.log('✅ Python API conectada:', response.data.status);
      console.log('🤖 Modelos carregados:', response.data.models);
    }
  } catch (error) {
    console.error('❌ Python API não disponível:', error.message);
    console.log('⚠️ Verifique se o server-py está rodando na porta 8001');
  }
};

// ✅ CHAMAR TESTE APÓS STARTUP (dar mais tempo para a API Python subir e carregar modelos)
setTimeout(testarPythonAPI, 10000);

// Rota de saúde para verificar se o servidor está funcionando
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Node.js API'
    });
});

// Proxy de health da API Python (útil para diagnóstico via app/frontend)
app.get('/python/health', async (req, res) => {
    try {
        const r = await axios.get(`${PYTHON_API_BASE_URL}/health`, { timeout: 5000 });
        res.status(200).json({ ok: true, source: PYTHON_API_BASE_URL, data: r.data });
    } catch (err) {
        res.status(503).json({ ok: false, source: PYTHON_API_BASE_URL, error: err.message });
    }
});

/**
 * Endpoint para a primeira etapa do fluxo: Detecção de Bounding Boxes.
 * Recebe a imagem original e a repassa para a API Python para detecção.
 * Retorna as boxes detectadas e as informações de redimensionamento.
 */
// ENDPOINT DETECTAR
app.post('/api/detect-ulcers', upload.single('file'), async (req, res) => {
    try {
        console.log('🔍 === DEBUG COMPLETO ===');
        console.log('PYTHON_API_URL env var:', process.env.PYTHON_API_BASE_URL);
        console.log('PYTHON_API_BASE_URL const:', PYTHON_API_BASE_URL);
        console.log('Arquivo recebido:', req.file ? 'SIM' : 'NÃO');

        // ⭐ VERIFICAR SE A VARIÁVEL ESTÁ DEFINIDA
        if (!PYTHON_API_BASE_URL) {
            console.error('❌ PYTHON_API_BASE_URL é undefined!');
            console.log('Todas as env vars:', Object.keys(process.env));
            return res.status(500).json({
                success: false,
                message: 'PYTHON_API_BASE_URL não está configurada',
                debug: {
                    PYTHON_API_URL: process.env.PYTHON_API_URL,
                    allEnvKeys: Object.keys(process.env).filter(k => k.includes('PYTHON'))
                }
            });
        }

        const urlDetection = `${PYTHON_API_BASE_URL}/predict/detection`; // ✅ ROTA CORRETA
        console.log('🌐 URL montada:', urlDetection);

        // ⭐ TESTAR A URL ANTES DE USAR (COM FETCH)
        try {
            console.log('🧪 Testando conectividade com server-py...');
            const testResponse = await axios.get(`${PYTHON_API_BASE_URL}/health`, { timeout: 15000 });
            console.log('🧪 Teste de conectividade:', testResponse.status);
        } catch (testError) {
            console.error('🧪 Falha no teste de conectividade:', testError.message);
            return res.status(500).json({
                success: false,
                message: 'Server-py indisponível',
                debug: {
                    url: PYTHON_API_BASE_URL,
                    error: testError.message
                }
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo enviado'
            });
        }

        console.log('📤 Enviando para server-py...');

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        console.log('🔗 Fazendo fetch para:', urlDetection);

        const response = await axios.post(urlDetection, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 240000, // 240 segundos
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('📊 Status da resposta:', response.status);
        console.log('✅ Dados recebidos do server-py');

        res.json({
            success: true,
            ...response.data
        });

    } catch (error) {
        console.error('❌ ERRO COMPLETO:', {
            message: error.message,
            stack: error.stack
        });

        // ⭐ TRATAMENTO DE ERRO ESPECÍFICO PARA AXIOS
        let errorMessage = error.message;
        let statusCode = 500;

        if (error.response) {
            // Server respondeu com erro
            statusCode = error.response.status;
            errorMessage = error.response.data?.message || error.response.statusText || error.message;
        } else if (error.request) {
            // Request foi feito mas não houve resposta
            errorMessage = 'Server-py não está respondendo';
            statusCode = 503;
        } else {
            // Erro na configuração da request
            errorMessage = 'Erro na configuração da requisição';
        }


        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            statusText: error.response?.statusText,
            data: error.response?.data,
            config: error.config?.url,
            debug: {
                PYTHON_API_BASE_URL: PYTHON_API_BASE_URL || 'undefined'
            }
        });
    }
});

/**
 * Endpoint para a segunda etapa do fluxo: Classificação de Regiões.
 * Recebe a imagem original e o JSON das boxes editadas pelo usuário.
 * Repassa para a API Python para classificação.
 * Retorna os resultados finais.
 */

app.post('/api/classify-regions', express.json(), async (req, res) => {
    try {
        const { imagem_redimensionada, boxes_finais } = req.body;

        if (!imagem_redimensionada || !boxes_finais) {
            return res.status(400).json({
                success: false,
                message: 'Dados insuficientes para classificação'
            });
        }

        console.log(`--- Etapa 2: Classificando ${boxes_finais.length} regiões... ---`);

        // 1. Preparar dados para o servidor Python
        const imageBuffer = Buffer.from(imagem_redimensionada, 'base64');
        const formClassification = new FormData();
        formClassification.append('file', stream.Readable.from(imageBuffer), {
            filename: 'ulcera_analise.jpg',
            contentType: 'image/jpeg'
        });
        formClassification.append('deteccoes_json', JSON.stringify(boxes_finais));

        // 2. Chamar o servidor Python
        const urlClassification = `${PYTHON_API_BASE_URL}/predict/classification`;
        console.log('🔗 Chamando URL de classificação:', urlClassification);

        const responseClassification = await axios.post(urlClassification, formClassification, {
            headers: { ...formClassification.getHeaders() },
            timeout: 60000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log(`✅ Classificação concluída no Python. Status: ${responseClassification.status}`);

        if (!responseClassification.data || !responseClassification.data.resultados) {
            throw new Error('Resposta inválida do servidor de IA: resultados não encontrados');
        }

        // 3. Simplesmente pegar os resultados e repassar
        // O Python já retornou o campo 'subimagem' para cada resultado.
        const resultados_classificacao = responseClassification.data.resultados;
        
        console.log(`📊 ${resultados_classificacao.length} resultados com sub-imagens recebidos do Python.`);

        res.json({
            success: true,
            message: 'Classificação realizada com sucesso',
            resultados_classificacao, // <-- Repassa o array inteiro, já pronto
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro na classificação:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });

        let errorMessage = error.message;
        let statusCode = 500;
        if (error.response) {
            statusCode = error.response.status;
            errorMessage = error.response.data?.message || error.response.statusText || error.message;
        } else if (error.request) {
            errorMessage = 'Servidor de IA não está respondendo para classificação';
            statusCode = 503;
        }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});



app.post('/api/save-analysis', express.json(), async (req, res) => {
    try {

        const bucket = getBucket(); // <-- Chame a função para obter a instância do bucket
        // ⭐ NOVA VERIFICAÇÃO DE SEGURANÇA
        if (!bucket) {
            console.error('❌ Ação bloqueada: Firebase Storage bucket não está inicializado.');
            return res.status(503).json({
                success: false,
                message: 'O serviço de armazenamento de arquivos está indisponível. Contate o suporte.'
            });
        }

        const {
            medico_id,
            paciente_id,
            imagem_original,
            regioes_analisadas,
            diagnostico_geral
        } = req.body;

        if (!medico_id || !paciente_id || !diagnostico_geral || !imagem_original) {
            return res.status(400).json({
                success: false,
                message: 'Dados obrigatórios ausentes'
            });
        }

        console.log('--- Etapa 3: Salvando Análise ---');

        // ⭐ BUSCAR MÉDICO PELO UID DO FIREBASE
        const medico = await Profissional.findOne({ firebaseUid: medico_id });
        if (!medico) {
            return res.status(404).json({
                success: false,
                message: 'Médico não encontrado'
            });
        }

        // ⭐ VERIFICAR SE PACIENTE PERTENCE AO MÉDICO
        const paciente = await Paciente.findOne({
            _id: paciente_id,
            medicoId: medico._id
        });
        if (!paciente) {
            return res.status(404).json({
                success: false,
                message: 'Paciente não encontrado ou não pertence a você'
            });
        }

        // ⭐ GERAR ID TEMPORÁRIO PARA O ARQUIVO
        const tempAnaliseId = new mongoose.Types.ObjectId();
        const nomeArquivo = `${medico._id}_${paciente_id}_${tempAnaliseId}.jpg`;
        console.log(`📤 Fazendo upload da imagem: ${nomeArquivo}`);

        // ⭐ UPLOAD DA IMAGEM PRIMEIRO
        const imageBuffer = Buffer.from(imagem_original, 'base64');
        const file = bucket.file(`analises/${nomeArquivo}`);

        const stream = file.createWriteStream({
            metadata: {
                contentType: 'image/jpeg',
                metadata: {
                    medicoId: medico._id.toString(),
                    medicoFirebaseUid: medico_id,
                    pacienteId: paciente_id,
                    analiseId: tempAnaliseId.toString(),
                    uploadDate: new Date().toISOString()
                }
            }
        });

        // ⭐ PROMISE PARA AGUARDAR O UPLOAD
        const uploadPromise = new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.error('❌ Erro no upload:', error);
                reject(error);
            });

            stream.on('finish', async () => {
                try {
                    await file.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/analises/${nomeArquivo}`;
                    console.log(`✅ Upload concluído: ${publicUrl}`);
                    resolve(publicUrl);
                } catch (error) {
                    console.error('❌ Erro ao tornar público:', error);
                    reject(error);
                }
            });
        });

        // ⭐ ENVIAR BUFFER PARA O STREAM
        stream.end(imageBuffer);

        // ⭐ AGUARDAR UPLOAD COMPLETAR
        const firebaseUrl = await uploadPromise;

        // ⭐ AGORA CRIAR ANÁLISE COM URL COMPLETA
        const novaAnalise = new Analise({
            _id: tempAnaliseId,           // ⭐ USAR O ID GERADO
            medicoId: medico._id,
            pacienteId: paciente_id,
            originalImageUrl: firebaseUrl, // ⭐ JÁ COM URL COMPLETA
            boxes: (regioes_analisadas || []).map(regiao => ({
                xMin: regiao.coordenadas?.xmin || 0,
                yMin: regiao.coordenadas?.ymin || 0,
                xMax: regiao.coordenadas?.xmax || 0,
                yMax: regiao.coordenadas?.ymax || 0,
                classification: {
                    label: regiao.classificacao_ia?.classe || 'Não classificado',
                    confidence: regiao.classificacao_ia?.confianca || 0
                },
                diagnosis: regiao.diagnostico_medico || ''
            })),
            imageDiagnosis: diagnostico_geral
        });

        // ⭐ SALVAR ANÁLISE COMPLETA
        await novaAnalise.save();
        console.log(`📝 Análise criada no MongoDB com ID: ${novaAnalise._id}`);

        console.log(`✅ Análise completa salva para paciente ${paciente.nome}`);
        console.log(`🔗 URL da imagem: ${firebaseUrl}`);

        res.json({
            success: true,
            message: 'Análise salva com sucesso',
            analise_id: novaAnalise._id.toString(),
            firebase_url: firebaseUrl,
            nome_arquivo: nomeArquivo,
            medico: {
                id: medico._id,
                nome: medico.nome,
                firebaseUid: medico.firebaseUid
            },
            paciente: {
                id: paciente._id,
                nome: paciente.nome
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao salvar análise:', error.message);

        res.status(500).json({
            success: false,
            message: error.message || 'Erro ao salvar análise',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.get('/analises/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID da análise inválido'
            });
        }

        const analise = await Analise.findById(id)
            .populate('medicoId', 'nome email firebaseUid')
            .populate('pacienteId', 'nome cpf telefone email');

        if (!analise) {
            return res.status(404).json({
                success: false,
                message: 'Análise não encontrada'
            });
        }

        res.json({
            success: true,
            data: analise
        });

    } catch (error) {
        console.error('❌ Erro ao buscar análise:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar análise'
        });
    }
});

// ⭐ NOVA ROTA OTIMIZADA PARA EXIBIR DETALHES DA ANÁLISE COM SUB-IMAGENS
app.get('/api/analise-detalhada/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID da análise inválido' });
        }

        // 1. Buscar a análise do MongoDB, com dados do paciente populados
        const analise = await Analise.findById(id)
            .populate('pacienteId', 'nome')
            .lean(); // .lean() para performance, pois vamos modificar o objeto

        if (!analise) {
            return res.status(404).json({ success: false, message: 'Análise não encontrada' });
        }

        // 2. Fazer o download da imagem original do Firebase Storage
        console.log(`📥 Baixando imagem: ${analise.originalImageUrl}`);
        const response = await axios.get(analise.originalImageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');

        // 3. Processar cada caixa para gerar a sub-imagem
        const boxesComSubimagens = await Promise.all(
            analise.boxes.map(async (box) => {
                try {
                    // Usa a biblioteca 'sharp' para cortar a imagem
                    const subImageBuffer = await sharp(imageBuffer)
                        .extract({
                            left: box.xMin,
                            top: box.yMin,
                            width: box.xMax - box.xMin,
                            height: box.yMax - box.yMin
                        })
                        .jpeg({ quality: 80 }) // Comprime um pouco para economizar banda
                        .toBuffer();

                    // Converte o buffer da sub-imagem para base64
                    const subImagemBase64 = subImageBuffer.toString('base64');

                    return {
                        ...box,
                        subimagem: subImagemBase64, // Adiciona o novo campo
                    };
                } catch (cropError) {
                    console.error(`❌ Erro ao cortar box ${box._id}:`, cropError.message);
                    // Retorna a caixa sem sub-imagem em caso de erro no corte
                    return { ...box, subimagem: null };
                }
            })
        );

        // 4. Montar a resposta final
        const respostaFinal = {
            ...analise,
            boxes: boxesComSubimagens, // Substitui as caixas originais pelas novas com sub-imagens
        };

        res.json({
            success: true,
            data: respostaFinal,
        });

    } catch (error) {
        console.error('❌ Erro ao buscar análise detalhada:', error.message);
        res.status(500).json({ success: false, message: 'Erro ao processar a análise detalhada' });
    }
});

// ⭐ LISTAR ANÁLISES DE UM PACIENTE
app.get('/pacientes/:pacienteId/analises', async (req, res) => {
    try {
        const { pacienteId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(pacienteId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do paciente inválido'
            });
        }

        const analises = await Analise.find({ pacienteId })
            .populate('medicoId', 'nome email')
            .sort({ createdAt: -1 }); // Mais recentes primeiro

        res.json({
            success: true,
            data: analises,
            total: analises.length
        });

    } catch (error) {
        console.error('❌ Erro ao buscar análises:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar análises'
        });
    }
});



// Middleware para capturar rotas não encontradas
app.use((req, res) => {
    res.status(404).json({
        erro: 'Rota não encontrada',
        message: `A rota ${req.method} ${req.originalUrl} não existe`,
        rotas_disponiveis: [
            'GET /health',
            'POST /api/detect-ulcers',
            'POST /api/classify-regions',
            'POST /api/save-analysis',
            'GET /analises/:id',
            'GET /pacientes/:pacienteId/analises',
            'GET /pacientes',
            'POST /logup'
        ]
    });
});

// Middleware para tratamento de erros globais
app.use((error, req, res, next) => {
    console.error('❌ Erro não tratado:', error);
    res.status(500).json({
        erro: 'Erro interno do servidor',
        message: 'Ocorreu um erro inesperado'
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 Recebido SIGTERM, encerrando servidor...');
    mongoose.connection.close().then(() => {
        console.log('🔒 Conexão com MongoDB fechada');
        process.exit(0);
    });
});

// Inicia o servidor
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor Node.js rodando na porta ${port}`);
    console.log(`🌐 Health check: http://localhost:${port}/health`);
    console.log(`🔗 Python API URL: ${PYTHON_API_BASE_URL}`);
    console.log(`📝 MongoDB: ${MONGO_URI ? 'Configurado' : 'Não configurado'}`);
});