import os
import torch
import pathlib
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.resnet50 import preprocess_input as resnet_preprocess
import io
from PIL import Image
import base64
import json
import logging
import asyncio
from pathlib import Path
import requests
import re
import psutil
import time

# ============================================
# 🚀 AUTO-DETECÇÃO E CONFIGURAÇÃO DE HARDWARE
# ============================================
def configurar_hardware():
    """Detecta automaticamente GPU/CPU e otimiza"""
    cpu_threads = os.cpu_count()
    ram_gb = psutil.virtual_memory().total / (1024**3)
    gpu_disponivel = torch.cuda.is_available()
    
    print("\n" + "="*60)
    print("🔍 DETECTANDO HARDWARE")
    print("="*60)
    print(f"💻 CPU: {psutil.cpu_count(logical=False)} cores / {cpu_threads} threads")
    print(f"💾 RAM: {ram_gb:.1f}GB")
    
    if gpu_disponivel:
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print(f"🎮 GPU: {gpu_name}")
        print(f"💾 VRAM: {gpu_memory:.1f}GB")
        print(f"✅ Modo: GPU ACELERADA")
        
        # Configurar TensorFlow GPU
        gpus = tf.config.list_physical_devices('GPU')
        if gpus:
            for gpu in gpus:
                tf.config.experimental.set_memory_growth(gpu, True)
        
        target_size = 640
        device = 'cuda'
    else:
        print(f"⚠️  GPU NVIDIA: Não detectada")
        print(f"✅ Modo: CPU OTIMIZADA (Multi-thread)")
        
        # Otimizar TensorFlow para CPU
        os.environ['OMP_NUM_THREADS'] = str(cpu_threads)
        os.environ['TF_NUM_INTRAOP_THREADS'] = str(cpu_threads)
        os.environ['TF_NUM_INTEROP_THREADS'] = '2'
        
        tf.config.threading.set_inter_op_parallelism_threads(2)
        tf.config.threading.set_intra_op_parallelism_threads(cpu_threads)
        
        target_size = 416  # Menor = mais rápido em CPU
        device = 'cpu'
    
    print("="*60 + "\n")
    
    return {
        'device': device,
        'gpu_disponivel': gpu_disponivel,
        'target_size': target_size,
        'cpu_threads': cpu_threads,
        'ram_gb': ram_gb
    }

# Executar configuração
HARDWARE_CONFIG = configurar_hardware()

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Variáveis de ambiente
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['YOLO_VERBOSE'] = 'False'

# ========================================
# FIX POSIXPATH (Windows/Linux)
# ========================================
def fix_yolo_deployment():
    """Fix para erro PosixPath"""
    if not hasattr(pathlib, 'PosixPath'):
        pathlib.PosixPath = pathlib.Path
    if os.name == 'nt' and hasattr(pathlib, 'WindowsPath'):
        pathlib.PosixPath = pathlib.WindowsPath
    logger.info("✅ Fix PosixPath aplicado")

fix_yolo_deployment()

# ========================================
# FASTAPI
# ========================================
app = FastAPI(title="Medical AI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================================
# VARIÁVEIS GLOBAIS
# ========================================
modelo_classificacao = None
modelo_yolo = None
LABEL_COLS = ['none', 'infection', 'ischaemia', 'both']
CLASSIFIER_INFO = {"name": None, "is_mock": False}

MODELO_CLASSIFICACAO_URL = os.getenv("MODELO_CLASSIFICACAO_URL", "")
MODELO_YOLO_URL = os.getenv("MODELO_YOLO_URL", "https://drive.google.com/uc?export=download&id=1oTSfjG_z63eLwSaCuj8gfHuSTk6-w1Tr")

MODELS_DIR = Path("models-ia")
MODELS_DIR.mkdir(exist_ok=True)

# ========================================
# DOWNLOAD DE MODELOS
# ========================================
async def baixar_google_drive_direto(file_id: str, destino: Path, descricao: str):
    """Download do Google Drive"""
    urls = [
        f"https://drive.google.com/uc?export=download&id={file_id}",
        f"https://drive.usercontent.google.com/download?id={file_id}&export=download"
    ]
    
    for i, url in enumerate(urls, 1):
        try:
            logger.info(f"🔄 Tentativa {i}/2: Baixando {descricao}...")
            
            session = requests.Session()
            response = session.get(url, stream=True, allow_redirects=True, timeout=300)
            
            # Handle virus scan warning
            if "confirm=" in response.url:
                for line in response.text.split('\n'):
                    if 'confirm=' in line:
                        token = re.search(r'confirm=([a-zA-Z0-9_-]+)', line)
                        if token:
                            url = f"{url}&confirm={token.group(1)}"
                            response = session.get(url, stream=True, timeout=300)
                            break
            
            response.raise_for_status()
            
            # Salvar arquivo
            with open(destino, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            
            # Validar
            if destino.exists() and destino.stat().st_size > 10000:
                size_mb = destino.stat().st_size / (1024*1024)
                logger.info(f"✅ {descricao} baixado: {size_mb:.1f}MB")
                return True
            else:
                if destino.exists():
                    destino.unlink()
                    
        except Exception as e:
            logger.warning(f"⚠️ Tentativa {i} falhou: {e}")
            if destino.exists():
                destino.unlink()
    
    return False

async def baixar_arquivo(url: str, destino: Path, descricao: str = "arquivo"):
    """Baixa arquivo com fallback"""
    if not url:
        raise ValueError(f"URL não configurada para {descricao}")
    
    if destino.exists():
        logger.info(f"✅ {descricao} já existe")
        return
    
    logger.info(f"📥 Baixando {descricao}...")
    
    # Extrair ID do Google Drive
    file_id = None
    patterns = [r'/d/([a-zA-Z0-9-_]+)', r'id=([a-zA-Z0-9-_]+)']
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            file_id = match.group(1)
            break
    
    # Tentar Google Drive
    if file_id:
        success = await baixar_google_drive_direto(file_id, destino, descricao)
        if success:
            return
    
    # Fallback: download direto
    response = requests.get(url, stream=True, timeout=300)
    response.raise_for_status()
    
    with open(destino, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    
    logger.info(f"✅ {descricao} baixado!")

# ========================================
# CARREGAMENTO DE MODELOS
# ========================================
async def carregar_modelo_classificacao():
    """Carrega modelo de classificação"""
    global modelo_classificacao
    
    if modelo_classificacao is not None:
        return
    
    modelo_path = MODELS_DIR / "resnet50_consolidado.keras"
    
    try:
        if not modelo_path.exists():
            # ✅ FALLBACK: tentar outros modelos
            fallbacks = [
                MODELS_DIR / "modeloClassificacao.h5",
                MODELS_DIR / "modeloClassificacao1.h5"
            ]
            
            modelo_encontrado = None
            for fallback in fallbacks:
                if fallback.exists():
                    modelo_path = fallback
                    modelo_encontrado = fallback.name
                    logger.info(f"⚠️ resnet50_consolidado.keras não encontrado, usando: {modelo_encontrado}")
                    break
            
            if not modelo_encontrado:
                logger.error(f"❌ Nenhum modelo encontrado na pasta {MODELS_DIR}")
                
                # ✅ LISTAR ARQUIVOS DISPONÍVEIS
                if MODELS_DIR.exists():
                    arquivos = list(MODELS_DIR.glob("*"))
                    logger.info("📁 Arquivos disponíveis:")
                    for arquivo in arquivos:
                        logger.info(f"   - {arquivo.name} ({arquivo.stat().st_size / (1024*1024):.1f}MB)")
                
                raise FileNotFoundError("Nenhum modelo de classificação encontrado")
        
        logger.info(f"📚 Carregando modelo: {modelo_path.name}")
        
        # ✅ CARREGAR MODELO
        modelo_classificacao = tf.keras.models.load_model(str(modelo_path), compile=False)
        CLASSIFIER_INFO["name"] = modelo_path.name
        CLASSIFIER_INFO["is_mock"] = False
        
        # ✅ INFO DO MODELO
        logger.info(f"✅ Modelo {modelo_path.name} carregado!")
        logger.info(f"📊 Input shape: {modelo_classificacao.input_shape}")
        logger.info(f"📊 Output shape: {modelo_classificacao.output_shape}")
        logger.info(f"📊 Parâmetros: {modelo_classificacao.count_params():,}")
        
        # ✅ WARM-UP
        logger.info("🔥 Aquecendo modelo...")
        dummy_input = np.random.rand(1, 224, 224, 3).astype(np.float32)
        _ = modelo_classificacao.predict(dummy_input, verbose=0)
        logger.info("🔥 Warm-up concluído!")
        
        logger.info("✅ Modelo de classificação pronto!")
        
    except Exception as e:
        logger.error(f"❌ Erro ao carregar modelo: {e}")
        logger.warning("🔧 Criando modelo mock para testes...")
        
        # ✅ MODELO MOCK EM CASO DE ERRO
        modelo_classificacao = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(224, 224, 3)),
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(len(LABEL_COLS), activation='softmax')
        ], name="MockClassifier")
        CLASSIFIER_INFO["name"] = "MockClassifier"
        CLASSIFIER_INFO["is_mock"] = True
        
        logger.warning("⚠️ Usando modelo mock - resultados não serão precisos!")

async def carregar_modelo_yolo():
    """Carrega YOLO (auto-detecta GPU/CPU)"""
    global modelo_yolo
    
    if modelo_yolo is not None:
        return
    
    logger.info("🎯 Carregando YOLO...")
    
    # Lista de estratégias
    estrategias = [
        lambda: carregar_yolo_customizado(),
        lambda: carregar_yolo_pretrained('yolov5s'),
        lambda: carregar_yolo_pretrained('yolov5n'),
        lambda: carregar_yolo_mock()
    ]
    
    for i, estrategia in enumerate(estrategias, 1):
        try:
            logger.info(f"🔄 Estratégia {i}/{len(estrategias)}...")
            resultado = estrategia()
            
            if hasattr(resultado, '__await__'):
                modelo_yolo = await resultado
            else:
                modelo_yolo = resultado
            
            if modelo_yolo is not None:
                # Configurar device
                device = HARDWARE_CONFIG['device']
                if hasattr(modelo_yolo, 'to'):
                    modelo_yolo.to(device)
                
                if hasattr(modelo_yolo, 'conf'):
                    modelo_yolo.conf = 0.25
                if hasattr(modelo_yolo, 'iou'):
                    modelo_yolo.iou = 0.45
                
                # Warm-up
                logger.info("🔥 Aquecendo YOLO...")
                dummy = torch.randn(1, 3, HARDWARE_CONFIG['target_size'], HARDWARE_CONFIG['target_size'])
                if device == 'cuda':
                    dummy = dummy.cuda()
                _ = modelo_yolo(dummy)
                
                logger.info(f"✅ YOLO pronto! (device: {device})")
                return
                
        except Exception as e:
            logger.warning(f"⚠️ Estratégia {i} falhou: {e}")
            continue
    
    logger.error("❌ Todas estratégias falharam, usando mock")
    modelo_yolo = carregar_yolo_mock()

async def carregar_yolo_customizado():
    """Carrega modelo customizado"""
    if not MODELO_YOLO_URL:
        raise ValueError("URL não configurada")
    
    modelo_path = MODELS_DIR / "bestYolov5_test.pt"
    await baixar_arquivo(MODELO_YOLO_URL, modelo_path, "YOLO customizado")
    
    tentativas = [
        lambda: torch.hub.load('ultralytics/yolov5', 'custom', path=str(modelo_path), trust_repo=True),
        lambda: torch.hub.load('ultralytics/yolov5', 'custom', path=str(modelo_path.resolve()), force_reload=True),
    ]
    
    for i, tentativa in enumerate(tentativas, 1):
        try:
            return tentativa()
        except Exception as e:
            logger.warning(f"Tentativa {i} falhou: {e}")
    
    raise Exception("Falha em todas as tentativas")

def carregar_yolo_pretrained(model_name):
    """Carrega YOLO pré-treinado"""
    logger.info(f"📦 Carregando {model_name}...")
    modelo = torch.hub.load('ultralytics/yolov5', model_name, pretrained=True, trust_repo=True)
    logger.info(f"✅ {model_name} carregado")
    return modelo

def carregar_yolo_mock():
    """Modelo mock"""
    logger.warning("🔧 Criando YOLO mock...")
    
    class YOLOMock:
        def __init__(self):
            self.names = {0: 'object'}
            self.conf = 0.25
            self.iou = 0.45
        
        def __call__(self, img):
            class Result:
                def __init__(self):
                    self.xyxy = [torch.tensor([])]
            return Result()
        
        def to(self, device):
            pass
    
    return YOLOMock()

@app.on_event("startup")
async def startup_event():
    """Inicialização"""
    logger.info("🚀 Iniciando API...")
    
    results = await asyncio.gather(
        carregar_modelo_classificacao(),
        carregar_modelo_yolo(),
        return_exceptions=True
    )
    
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"❌ Erro ao carregar modelo {i}: {result}")
    
    logger.info("✅ API pronta!")

# ========================================
# FUNÇÕES AUXILIARES
# ========================================
def redimensionar_imagem(img, target_size=None):
    """Redimensiona mantendo proporção"""
    if target_size is None:
        target_size = HARDWARE_CONFIG['target_size']
    
    w, h = img.size
    scale = min(target_size / w, target_size / h)
    
    new_w, new_h = int(w * scale), int(h * scale)
    img_resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
    
    img_padded = Image.new('RGB', (target_size, target_size), (0, 0, 0))
    paste_x = (target_size - new_w) // 2
    paste_y = (target_size - new_h) // 2
    img_padded.paste(img_resized, (paste_x, paste_y))
    
    return img_padded, {
        "original_size": {"width": w, "height": h},
        "resized_size": {"width": new_w, "height": new_h},
        "final_size": {"width": target_size, "height": target_size},
        "padding": {"x": paste_x, "y": paste_y},
        "scale_factor": scale
    }

def image_to_base64(img):
    """Converte PIL Image para base64"""
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG", quality=90)
    return base64.b64encode(buffered.getvalue()).decode()

def processar_deteccoes_yolo(results, img_original):
    """Processa resultados YOLO"""
    deteccoes = []
    
    try:
        if not hasattr(results, 'xyxy') or len(results.xyxy[0]) == 0:
            return deteccoes
        
        deteccoes_tensor = results.xyxy[0].cpu().numpy()
        
        for i, (*box, conf, cls) in enumerate(deteccoes_tensor):
            x1, y1, x2, y2 = map(int, box)
            confidence = float(conf)
            class_id = int(cls)

            cropped_img = img_original.crop((x1, y1, x2, y2))
            subimagem_base64 = image_to_base64(cropped_img)
            
            if hasattr(modelo_yolo, 'names') and class_id in modelo_yolo.names:
                class_name = modelo_yolo.names[class_id]
            else:
                class_name = f"class_{class_id}"
            
            deteccoes.append({
                "xmin": x1,
                "ymin": y1, 
                "xmax": x2,
                "ymax": y2,
                "classe": class_name,
                "confianca": confidence,
                "subimagem": subimagem_base64
            })
            
    except Exception as e:
        logger.error(f"Erro ao processar detecções: {e}")
        
    return deteccoes

# ========================================
# ENDPOINTS
# ========================================
@app.get("/")
async def root():
    return {
        "message": "Medical AI API",
        "version": "2.0.0",
        "status": "online",
        "hardware": HARDWARE_CONFIG,
        "endpoints": ["/predict/detection", "/predict/classification", "/health"]
    }

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    # Evita 404 ruidoso para browsers que pedem favicon por padrão
    return Response(status_code=204)

@app.get("/health")
async def health_check():
    """Status da API"""
    return {
        "status": "healthy",
        "models": {
            "classificacao": modelo_classificacao is not None,
            "classificador_info": CLASSIFIER_INFO,
            "yolo": modelo_yolo is not None
        },
        "hardware": HARDWARE_CONFIG
    }

@app.post("/predict/detection")
async def predict_detection(file: UploadFile = File(...)):
    """Detecção de objetos"""
    if modelo_yolo is None:
        raise HTTPException(status_code=503, detail="Modelo YOLO não carregado")
    
    try:
        start_time = time.time()
        
        contents = await file.read()
        img_original = Image.open(io.BytesIO(contents)).convert("RGB")
        
        img_resized, resize_info = redimensionar_imagem(img_original)
        
        logger.info("🔍 Executando detecção...")
        results = modelo_yolo(img_resized)
        
        deteccoes = processar_deteccoes_yolo(results, img_resized)
        
        imagem_base64 = image_to_base64(img_resized)
        
        tempo = time.time() - start_time
        logger.info(f"✅ {len(deteccoes)} detecções em {tempo:.2f}s")

        return JSONResponse(content={
            "boxes": deteccoes,
            "dimensoes": resize_info,
            "imagem_redimensionada": imagem_base64,
            "tempo_inferencia": round(tempo, 3),
            "device": HARDWARE_CONFIG['device']
        })
    
    except Exception as e:
        logger.error(f"Erro na detecção: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/classification")
async def predict_classification(file: UploadFile = File(...), deteccoes_json: str = Form(...)):
    """Classificação de subimagens"""
    if modelo_classificacao is None:
        raise HTTPException(status_code=503, detail="Modelo de classificação não carregado")
    
    try:
        deteccoes = json.loads(deteccoes_json)
        contents = await file.read()
        img_original = Image.open(io.BytesIO(contents)).convert("RGB")
        
        resultados_finais = []

        if not deteccoes:
            return JSONResponse(content={"resultados": resultados_finais})

        for det in deteccoes:
            xmin = int(det.get("xmin", 0))
            ymin = int(det.get("ymin", 0))
            xmax = int(det.get("xmax", 0))
            ymax = int(det.get("ymax", 0))
            
            cropped_img = img_original.crop((xmin, ymin, xmax, ymax))
            img_resized = cropped_img.resize((224, 224))

            img_array = image.img_to_array(img_resized)
            # Aplicar preprocessamento adequado ao classificador
            # Se for ResNet (modelo padrão), use o preprocess_input da ResNet (modo 'caffe').
            try:
                if CLASSIFIER_INFO.get("name") and "resnet" in CLASSIFIER_INFO["name"].lower():
                    img_array = resnet_preprocess(np.expand_dims(img_array.copy(), axis=0))
                else:
                    img_array = np.expand_dims(img_array.astype(np.float32) / 255.0, axis=0)
            except Exception:
                img_array = np.expand_dims(img_array.astype(np.float32) / 255.0, axis=0)

            pred = modelo_classificacao.predict(img_array, verbose=0)
            index = np.argmax(pred[0])
            classe_predita = LABEL_COLS[index]
            confianca_maxima = float(np.max(pred[0]))
            subimagem_base64 = image_to_base64(cropped_img)
            
            resultados_finais.append({
                "xmin": xmin,
                "ymin": ymin,
                "xmax": xmax,
                "ymax": ymax,
                "classe_deteccao": det.get("classe"),
                "confianca_deteccao": det.get("confianca"),
                "classe_classificacao": classe_predita,
                "confianca_classificacao": confianca_maxima,
                "subimagem": subimagem_base64
            })

        return JSONResponse(content={"resultados": resultados_finais})
    
    except json.JSONDecodeError as e:
        logger.error(f"Erro ao decodificar JSON: {e}")
        raise HTTPException(status_code=400, detail="Formato JSON inválido.")
    except Exception as e:
        logger.error(f"Erro na classificação: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models/info")
async def models_info():
    """Informações dos modelos"""
    try:
        yolo_classes = []
        yolo_info = {}
        
        if modelo_yolo and hasattr(modelo_yolo, 'names'):
            yolo_classes = list(modelo_yolo.names.values())
            yolo_info = {
                "classes": yolo_classes,
                "total_classes": len(yolo_classes),
                "confidence_threshold": getattr(modelo_yolo, 'conf', 0.25),
                "iou_threshold": getattr(modelo_yolo, 'iou', 0.45),
                "input_size": f"{HARDWARE_CONFIG['target_size']}x{HARDWARE_CONFIG['target_size']}"
            }
        
        return JSONResponse(content={
            "classificacao": {
                "classes": LABEL_COLS,
                "input_shape": "224x224x3",
                "loaded": modelo_classificacao is not None,
                "classifier_info": CLASSIFIER_INFO
            },
            "deteccao": {
                **yolo_info,
                "loaded": modelo_yolo is not None
            },
            "hardware": HARDWARE_CONFIG
        })
    except Exception as e:
        logger.error(f"Erro ao obter info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ========================================
# MAIN
# ========================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",   # aceita conexões locais e da rede
        port=8001,
        log_level="info"
    )

    