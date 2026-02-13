// backDFU/scripts/fix-indexes.js - CRIAR ESTE ARQUIVO

const mongoose = require('mongoose');
require('dotenv').config();

async function fixIndexes() {
  try {
    await mongoose.connect('mongodb+srv://Edson_Limci:Limci123@cluster0.vvfbjcz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
    console.log('📡 Conectado ao MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('profissionais');
    
    // ⭐ LISTAR ÍNDICES ATUAIS
    const indexes = await collection.indexes();
    console.log('📋 Índices atuais:', indexes);
    
    // ⭐ REMOVER ÍNDICE ANTIGO userId_1
    try {
      await collection.dropIndex('userId_1');
      console.log('✅ Índice userId_1 removido');
    } catch (error) {
      console.log('⚠️ Índice userId_1 não existe ou já foi removido');
    }
    
    // ⭐ REMOVER ÍNDICE ANTIGO email_1 SE EXISTIR
    try {
      await collection.dropIndex('email_1');
      console.log('✅ Índice email_1 removido');
    } catch (error) {
      console.log('⚠️ Índice email_1 não existe');
    }
    
    // ⭐ CRIAR ÍNDICES CORRETOS
    await collection.createIndex({ firebaseUid: 1 }, { unique: true });
    await collection.createIndex({ email: 1 }, { unique: true });
    console.log('✅ Novos índices criados');
    
    // ⭐ VERIFICAR ÍNDICES FINAIS
    const newIndexes = await collection.indexes();
    console.log('📋 Novos índices:', newIndexes);
    
    mongoose.disconnect();
    console.log('✅ Script concluído');
    
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

fixIndexes();