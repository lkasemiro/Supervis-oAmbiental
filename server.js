require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // Mantém as fotos na memória temporária

// Configuração da Conexão PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Necessário para o Neon
});

app.use(cors());
app.use(express.json());

// ============================================================
// ROTA DE SINCRONIZAÇÃO DAS VISTORIAS
// ============================================================
app.post('/vistorias/sincronizar', upload.array('files'), async (req, res) => {
  const client = await pool.connect();

  try {
    // 1. Extrai o payload JSON do FormData
    if (!req.body.payload) {
      return res.status(400).json({ status: 'erro', message: 'Payload JSON não informado.' });
    }

    const payload = JSON.parse(req.body.payload);
    const files = req.files || [];

    const {
      codigo_vistoria,
      tecnico,
      colaborador,
      localidade,
      sublocal,
      tipo_roteiro,
      data_vistoria,
      respostas,
      respostas_flat
    } = payload;

    // Inicia a transação no banco de dados
    await client.query('BEGIN');

    // 2. Insere ou atualiza os dados da vistoria (UPSERT)
    const sqlVistoria = `
      INSERT INTO supervisao_ambiental.vistorias (
        codigo_vistoria, tecnico, colaborador, localidade, sublocal,
        tipo_roteiro, data_vistoria, respostas, respostas_flat
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (codigo_vistoria) DO UPDATE SET
        tecnico = EXCLUDED.tecnico,
        colaborador = EXCLUDED.colaborador,
        localidade = EXCLUDED.localidade,
        sublocal = EXCLUDED.sublocal,
        tipo_roteiro = EXCLUDED.tipo_roteiro,
        data_vistoria = EXCLUDED.data_vistoria,
        respostas = EXCLUDED.respostas,
        respostas_flat = EXCLUDED.respostas_flat,
        sincronizado_em = CURRENT_TIMESTAMP
    `;

    await client.query(sqlVistoria, [
      codigo_vistoria,
      tecnico,
      colaborador || '',
      localidade,
      sublocal || '',
      tipo_roteiro,
      data_vistoria,
      JSON.stringify(respostas || {}),
      JSON.stringify(respostas_flat || {})
    ]);

    // 3. Processa e insere as fotos anexadas no FormData
    for (const file of files) {
      // O nome do arquivo gerado pelo sync_manager.js vem no formato: fotoId__perguntaId.ext
      const filename = file.originalname || '';
      const parts = filename.split('__');
      
      const foto_id = parts[0] || `foto_${Date.now()}`;
      const pergunta_id = parts[1] ? parts[1].split('.')[0] : 'foto_geral';

      // Converte o buffer do arquivo em string Base64 para salvar no Postgres
      const foto_base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      const sqlFoto = `
        INSERT INTO supervisao_ambiental.vistorias_fotos (
          codigo_vistoria, foto_id, pergunta_id, nome_arquivo, mime_type, foto_base64
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `;

      await client.query(sqlFoto, [
        codigo_vistoria,
        foto_id,
        pergunta_id,
        filename,
        file.mimetype,
        foto_base64
      ]);
    }

    // Confirma todas as alterações no banco
    await client.query('COMMIT');

    console.log(`✅ Vistoria ${codigo_vistoria} e ${files.length} fotos salvas com sucesso no Neon!`);
    
    return res.json({
      status: 'sucesso',
      message: 'Vistoria sincronizada com sucesso.',
      codigo_vistoria
    });

  } catch (error) {
    // Em caso de erro, desfaz a transação
    await client.query('ROLLBACK');
    console.error('❌ Erro ao salvar vistoria no Neon:', error);
    
    return res.status(500).json({
      status: 'erro',
      message: error.message || 'Erro interno ao processar sincronização.'
    });

  } finally {
    // Libera a conexão de volta para o pool
    client.release();
  }
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API de Sincronização rodando na porta ${PORT}`);
});