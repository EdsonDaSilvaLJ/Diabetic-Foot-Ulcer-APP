# 🔐 Guia de Configuração de Credenciais

Este documento explica como obter e configurar as credenciais necessárias para executar o projeto.

## 📋 Credenciais Necessárias

### 1. Firebase

#### Para o Backend (backDFU)

1. Acesse o [Console do Firebase](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá em **Configurações do Projeto** (ícone de engrenagem) → **Contas de Serviço**
4. Clique em **Gerar nova chave privada**
5. Salve o arquivo JSON baixado na pasta `backDFU/config/` (este arquivo NÃO deve ser commitado)

As informações do arquivo JSON devem ser adicionadas ao `.env` do backDFU:
```bash
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_PRIVATE_KEY_ID=sua_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@seu-projeto.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=seu_client_id
FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
```

#### Para o Frontend (frontDFU)

1. Acesse o [Console do Firebase](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá em **Configurações do Projeto** → **Suas aplicações**
4. Selecione o aplicativo Web (ou crie um novo)
5. Copie as configurações do Firebase Config

Adicione ao `.env` do frontDFU:
```bash
EXPO_PUBLIC_FIREBASE_API_KEY=sua_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=seu_app_id
```

#### Habilitar Serviços no Firebase

Certifique-se de habilitar os seguintes serviços:
- ✅ **Authentication** (Email/Password)
- ✅ **Cloud Storage** (para armazenar imagens)
- ✅ **Regras de Segurança** configuradas adequadamente

### 2. MongoDB

#### Opção 1: MongoDB Atlas (Recomendado para produção)

1. Acesse o [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Crie uma conta ou faça login
3. Crie um novo Cluster (Free tier disponível)
4. Vá em **Database Access** e crie um usuário com senha
5. Vá em **Network Access** e adicione seu IP (ou 0.0.0.0/0 para qualquer IP)
6. Clique em **Connect** → **Connect your application**
7. Copie a string de conexão

Adicione ao `.env` do backDFU:
```bash
MONGO_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/?retryWrites=true&w=majority
```

#### Opção 2: MongoDB Local

```bash
# Instale o MongoDB localmente
# Windows: https://www.mongodb.com/try/download/community
# Linux: sudo apt-get install mongodb

# String de conexão local
MONGO_URI=mongodb://localhost:27017/dfu_database
```

### 3. Modelos de IA (server-py)

Os modelos de IA devem ser colocados na pasta `server-py/models-ia/`:

- `bestYolov5_test.pt` - Modelo YOLOv5 para detecção
- `resnet50_consolidado.keras` - Modelo ResNet50 para classificação

**Nota:** Os modelos não são incluídos no repositório devido ao tamanho. Entre em contato comigo para obter os arquivos.

## 🚀 Deploy - Variáveis de Ambiente

### Railway (Backend e Server-py)

Para fazer deploy no Railway, você precisa configurar as variáveis de ambiente:

#### Backend (backDFU)
```bash
MONGO_URI=sua_string_de_conexao_mongodb
FIREBASE_CREDENTIALS_BASE64=credenciais_em_base64
FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
PYTHON_API_BASE_URL=https://seu-servidor-python.railway.app
PORT=3000
NODE_ENV=production
```

**Como gerar FIREBASE_CREDENTIALS_BASE64:**
```bash
# Linux/Mac
base64 -i config/seu-arquivo-firebase.json | tr -d '\n'

# Windows (PowerShell)
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("config\seu-arquivo-firebase.json"))
```

#### Server-py
```bash
ENV=production
HOST=0.0.0.0
PORT=8000
MAX_FILE_SIZE=20MB
```

### Expo (Frontend)

Para publicar no Expo, configure as variáveis no arquivo `.env`:
```bash
EXPO_PUBLIC_API_URL=sua-api-backend.railway.app
EXPO_PUBLIC_ENV=production
# ... outras variáveis do Firebase
```

## ⚠️ Segurança

### ❌ NUNCA faça:
- Commitar arquivos `.env`
- Commitar credenciais Firebase (`.json`)
- Expor chaves de API em código
- Dar permissões excessivas no MongoDB ou Firebase

### ✅ SEMPRE faça:
- Use variáveis de ambiente
- Mantenha `.gitignore` atualizado
- Use diferentes credenciais para dev/prod
- Rotacione chaves periodicamente
- Configure regras de segurança adequadas

## 🆘 Problemas Comuns

### Erro: "Firebase already initialized"
- Isso é normal, o código já trata este caso

### Erro: "MongoNetworkError"
- Verifique se o IP está liberado no MongoDB Atlas
- Confirme que a string de conexão está correta

### Erro: "FIREBASE_CREDENTIALS_BASE64 not found"
- Certifique-se de que a variável está definida no `.env`
- Verifique se não há espaços extras no valor

## 📞 Suporte

Para dúvidas sobre credenciais, abra uma issue no GitHub ou entre em contato com a equipe.
