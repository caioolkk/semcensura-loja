require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ================== INICIALIZAR FIREBASE ==================
try {
  let serviceAccount;
  
  // Tenta primeiro a variável de ambiente (Render)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('🔥 Conectado ao Firebase (variável de ambiente - Render)');
  } else {
    // Fallback para arquivo local (desenvolvimento)
    const fs = require('fs');
    const path = require('path');
    const serviceAccountPath = path.join(__dirname, 'firebase-key.json');
    
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      console.log('🔥 Conectado ao Firebase (arquivo local)');
    } else {
      throw new Error('Nenhuma configuração do Firebase encontrada');
    }
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  console.log('✅ Firebase inicializado com sucesso!');
} catch (error) {
  console.error('❌ Erro ao inicializar Firebase:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json());

// ================== EMAIL ==================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || 'sexyshopsemcensura0@gmail.com',
    pass: process.env.EMAIL_PASS || ''
  }
});

// ================== SEGURANÇA ADMIN ==================
const ADMIN_KEY = process.env.ADMIN_KEY || 'semcensura_admin_2024';
const verifyAdmin = (req, res, next) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
};

// ================== ROTAS PÚBLICAS ==================
// 🛍️ Listar Produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const snapshot = await db.collection('produtos').orderBy('createdAt', 'desc').get();
    const produtos = snapshot.docs.map(doc => ({ ...doc.data(), _id: doc.id }));
    res.json(produtos);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err);
    res.status(500).json({ error: err.message });
  }
});

// 📝 Cadastro
app.post('/register', async (req, res) => {
  const { nome, email, telefone, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Preencha tudo.' });
  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    if (!snapshot.empty) return res.status(400).json({ error: 'Email já cadastrado' });
    const token = crypto.randomBytes(32).toString('hex');

    await db.collection('users').add({
      nome, email, telefone, senha, token,
      verificado: false,
      createdAt: new Date().toISOString()
    });

    if (!process.env.EMAIL_PASS) {
      const userDoc = await db.collection('users').where('email', '==', email).get();
      if (!userDoc.empty) await userDoc.docs[0].ref.update({ verificado: true, token: null });
      return res.json({ message: 'Cadastro realizado!', user: { nome, email } });
    }

    const link = `${process.env.FRONTEND_URL || 'https://caioolkk.github.io/semcensura-frontend/'}confirmar?token=${token}`;
    transporter.sendMail({
      from: process.env.EMAIL_USER, to: email, subject: 'Confirme seu cadastro',
      html: `<a href="${link}">Clique aqui</a>`
    }).catch(err => console.warn('⚠️ Erro email:', err.message));

    res.json({ message: 'Cadastro realizado! Verifique seu email.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro no servidor.' });
  }
});

// ✅ Confirmar Email
app.get('/confirmar', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token inválido.');
  try {
    const snapshot = await db.collection('users').where('token', '==', token).get();
    if (snapshot.empty) return res.send('Link expirado.');
    await snapshot.docs[0].ref.update({ verificado: true, token: null });
    res.send('<div style="text-align:center;padding:40px;"><h2 style="color:#4CAF50;">Email Confirmado! 🎉</h2></div>');
  } catch (err) {
    res.status(500).send('Erro.');
  }
});

// 🔐 Login
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snapshot.empty) return res.status(401).json({ error: 'Usuário não encontrado' });
    const user = snapshot.docs[0].data();
    if (!user.verificado) return res.status(403).json({ error: 'Email não verificado' });
    if (user.senha !== senha) return res.status(401).json({ error: 'Senha incorreta' });
    res.json({ message: 'Login ok!', user: { nome: user.nome, email: user.email, telefone: user.telefone } });
  } catch (err) {
    res.status(500).json({ error: 'Erro no servidor.' });
  }
});

// ================== ROTAS DO PAINEL ADMIN ==================
// ➕ Adicionar Produto
app.post('/api/admin/produtos', verifyAdmin, async (req, res) => {
  const { nome, preco, descricao, imagem, categoria } = req.body;
  if (!nome || !preco || !categoria || !imagem) return res.status(400).json({ error: 'Campos obrigatórios' });
  try {
    await db.collection('produtos').add({
      nome,
      preco: parseFloat(preco),
      precoOriginal: parseFloat(preco) * 1.43,
      descricao,
      imagem,
      categoria,
      createdAt: new Date().toISOString()
    });
    res.json({ message: 'Produto adicionado!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✏️ Editar Produto
app.put('/api/admin/produtos/:id', verifyAdmin, async (req, res) => {
  const { nome, preco, descricao, imagem, categoria } = req.body;
  try {
    await db.collection('produtos').doc(req.params.id).set({
      nome,
      preco: parseFloat(preco),
      precoOriginal: parseFloat(preco) * 1.43,
      descricao,
      imagem,
      categoria
    }, { merge: true });
    res.json({ message: 'Produto atualizado!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🗑️ Remover Produto
app.delete('/api/admin/produtos/:id', verifyAdmin, async (req, res) => {
  try {
    await db.collection('produtos').doc(req.params.id).delete();
    res.json({ message: 'Produto removido' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 👥 Listar Usuários
app.get('/admin/usuarios', async (req, res) => {
  try {
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    const users = snapshot.docs.map(doc => {
      const data = doc.data(); delete data.senha; delete data.token; return data;
    });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================== INICIALIZAÇÃO ==================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔗 Backend URL: https://semcensura-loja.onrender.com`);
});