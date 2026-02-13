// backDFU/routes/profissionalRoute.js - CORRIGIR INCONSISTÊNCIA

const express = require('express');
const router = express.Router();
const Profissional = require('../models/Profissional');
const authenticateToken = require('../middleware/auth');

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // ⭐ VERIFICAR QUAL CAMPO O MIDDLEWARE ESTÁ DEFININDO
    console.log('🔍 === DEBUG DETALHADO ===');
    console.log('📋 req.firebaseUid:', req.firebaseUid);
    console.log('📋 req.userId:', req.userId);
    console.log('📧 req.userEmail:', req.userEmail);
    console.log('📋 Todos os campos req:', Object.keys(req).filter(k => k.includes('user') || k.includes('firebase')));
    
    // ⭐ TENTAR MÚLTIPLOS CAMPOS PARA ENCONTRAR O CORRETO
    const camposBusca = {};
    if (req.firebaseUid) camposBusca.firebaseUid = req.firebaseUid;
    if (req.userId) camposBusca.userId = req.userId;
    if (req.userEmail) camposBusca.email = req.userEmail;
    
    console.log('🔍 Buscando com campos:', camposBusca);
    
    // ⭐ BUSCAR POR QUALQUER UM DOS CAMPOS POSSÍVEIS
    const profissional = await Profissional.findOne({
      $or: [
        ...(req.firebaseUid ? [{ firebaseUid: req.firebaseUid }] : []),
        ...(req.userId ? [{ userId: req.userId }] : []),
        ...(req.userEmail ? [{ email: req.userEmail }] : [])
      ]
    });

    // ⭐ DEBUG: LISTAR PROFISSIONAIS EXISTENTES
    const profissionaisExistentes = await Profissional.find({}, 'firebaseUid userId email nome').limit(3);
    console.log('📋 Profissionais no banco:', profissionaisExistentes.map(p => ({
      firebaseUid: p.firebaseUid,
      userId: p.userId,
      email: p.email,
      nome: p.nome
    })));

    if (!profissional) {
      console.log('⚠️ Profissional não encontrado no MongoDB - precisa re-cadastrar');
      return res.status(404).json({
        success: false,
        error: 'Profissional não encontrado',
        message: 'Complete seu cadastro para continuar',
        needsSync: true,
        action: 'redirect_to_sync',
        debug: {
          searchFields: camposBusca,
          existingUsers: profissionaisExistentes.map(p => ({
            firebaseUid: p.firebaseUid,
            userId: p.userId,
            email: p.email
          }))
        }
      });
    }

    console.log('✅ Profissional encontrado:', profissional.nome);
    
    res.json({
      success: true,
      id: profissional._id,
      nome: profissional.nome,
      email: profissional.email,
      telefone: profissional.telefone,
      cpf: profissional.cpf,
      tipoProfissional: profissional.tipoProfissional,
      crm: profissional.crm,
      createdAt: profissional.createdAt,
      updatedAt: profissional.updatedAt
    });

  } catch (error) {
    console.error('❌ Erro ao verificar perfil:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: 'Tente novamente em alguns instantes',
      needsSync: true
    });
  }
});

module.exports = router;