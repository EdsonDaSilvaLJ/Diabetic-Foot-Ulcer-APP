# 🚀 Guia Rápido - Primeiro Commit no GitHub

Este guia mostra como fazer o primeiro commit do projeto no GitHub.

## 📋 Pré-requisitos

- Git instalado ([Download](https://git-scm.com/downloads))
- Conta no GitHub
- Ter configurado as credenciais do Git:
  ```bash
  git config --global user.name "Seu Nome"
  git config --global user.email "seu-email@example.com"
  ```

## 🎯 Passo a Passo

### 1. Criar Repositório no GitHub

1. Acesse [GitHub](https://github.com)
2. Clique em **New repository** (ou no ícone +)
3. Preencha:
   - **Repository name**: `DFU-App` (ou nome de sua escolha)
   - **Description**: "Sistema de análise de pé diabético com IA"
   - **Visibility**: Escolha Public ou Private
   - ⚠️ **NÃO** marque "Initialize with README" (já temos um)
4. Clique em **Create repository**

### 2. Inicializar Git Local

Abra o terminal na pasta do projeto e execute:

```bash
# Inicializar repositório Git (se ainda não foi feito)
git init

# Adicionar todos os arquivos (o .gitignore vai proteger os sensíveis)
git add .

# Verificar o que será commitado
git status

# Criar o primeiro commit
git commit -m "feat: commit inicial do projeto DFU App"
```

### 3. Conectar ao Repositório Remoto

Copie a URL do seu repositório no GitHub e execute:

```bash
# Adicionar o repositório remoto
git remote add origin https://github.com/seu-usuario/DFU-App.git

# Ou se preferir SSH:
# git remote add origin git@github.com:seu-usuario/DFU-App.git

# Verificar se foi adicionado corretamente
git remote -v
```

### 4. Enviar para o GitHub

```bash
# Renomear branch para 'main' (se necessário)
git branch -M main

# Fazer push para o GitHub
git push -u origin main
```

## ✅ Verificação Final

### Antes do Push, Verifique:

```bash
# Ver arquivos que serão commitados
git status

# Ver o conteúdo que será commitado
git diff --cached

# IMPORTANTE: Certifique-se de que NÃO há:
# - Arquivos .env
# - Credenciais Firebase (*.json na pasta config)
# - Chaves de API
# - Senhas ou tokens
```

### Verificar o .gitignore

Abra o arquivo `.gitignore` e confirme que contém:
```
.env
**/.env
**/config/*firebase-adminsdk*.json
node_modules/
```

## 🔒 Segurança - IMPORTANTE!

Se você acidentalmente commitou informações sensíveis:

### Remover do último commit:
```bash
# Desfazer o último commit (mantém as mudanças)
git reset --soft HEAD~1

# Remover arquivos sensíveis
git rm --cached caminho/do/arquivo-sensivel

# Fazer commit novamente
git commit -m "feat: commit inicial do projeto DFU App"
```

### Se já fez push:
```bash
# ⚠️ ATENÇÃO: Isso reescreve o histórico!
git push --force origin main
```

⚠️ **Se credenciais foram expostas:**
1. **Troque TODAS as credenciais imediatamente!**
2. Gere novas chaves do Firebase
3. Crie novo usuário no MongoDB
4. Rotacione todas as senhas

## 📚 Comandos Úteis

```bash
# Ver histórico de commits
git log --oneline

# Ver mudanças não commitadas
git diff

# Adicionar arquivo específico
git add caminho/do/arquivo

# Criar branch para desenvolvimento
git checkout -b develop

# Voltar para a main
git checkout main

# Atualizar do repositório remoto
git pull origin main
```

## 🌿 Estrutura de Branches Recomendada

```bash
# Criar branch de desenvolvimento
git checkout -b develop
git push -u origin develop

# Para novas features, criar a partir da develop:
git checkout develop
git checkout -b feature/nome-da-feature

# Após finalizar, fazer merge na develop:
git checkout develop
git merge feature/nome-da-feature

# Quando estiver estável, fazer merge na main:
git checkout main
git merge develop
git push origin main
```

## 🎉 Pronto!

Seu projeto agora está no GitHub e protegido com `.gitignore` adequado.

### Próximos Passos:

1. Configure as **GitHub Actions** (CI/CD) se necessário
2. Adicione **Secrets** no GitHub para deploy automático
3. Configure **Branch Protection Rules** na branch main
4. Adicione colaboradores, se for um projeto em equipe

## 🆘 Problemas Comuns

### Erro: "fatal: remote origin already exists"
```bash
git remote remove origin
git remote add origin https://github.com/seu-usuario/DFU-App.git
```

### Erro: "Updates were rejected"
```bash
# Se tiver certeza: force push (cuidado!)
git push -f origin main

# Ou: pull primeiro e depois push
git pull origin main --rebase
git push origin main
```

### Erro: "Permission denied (publickey)"
- Configure SSH keys no GitHub
- Ou use HTTPS em vez de SSH

## 📞 Ajuda

- [Documentação Git](https://git-scm.com/doc)
- [Guias GitHub](https://guides.github.com/)
- [Git Cheat Sheet](https://education.github.com/git-cheat-sheet-education.pdf)

---

**Dica:** Sempre verifique o que está commitando antes de fazer push!
