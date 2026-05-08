require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ================== CONEXÃO MONGODB ==================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('❌ Erro MongoDB:', err));

// ================== MODELOS ==================
const userSchema = new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  telefone: String,
  senha: String,
  token: String,
  verificado: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
  nome: String,
  preco: Number,
  precoOriginal: Number,
  descricao: String,
  imagem: String,
  categoria: { type: String, enum: ['paraela', 'paraele', 'casal'] },
  createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json());

// Email
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

// 📝 Cadastro
app.post('/register', async (req, res) => {
  const { nome, email, telefone, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Preencha tudo.' });
  
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email já cadastrado' });

    const token = crypto.randomBytes(32).toString('hex');
    const user = new User({ nome, email, telefone, senha, token, verificado: false });
    await user.save();

    if (!process.env.EMAIL_PASS) {
      user.verificado = true;
      await user.save();
      return res.json({ message: 'Cadastro realizado!', user: { nome, email } });
    }

    const link = `${process.env.FRONTEND_URL || 'https://caioolkk.github.io/semcensura-frontend/'}confirmar?token=${token}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Confirme seu cadastro',
      html: `<a href="${link}">Clique aqui</a>`
    });

    res.json({ message: 'Cadastro realizado! Verifique seu email.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro no servidor.' });
  }
});

// ✅ Confirmar email
app.get('/confirmar', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('<h3>Token inválido</h3>');
  
  try {
    const user = await User.findOne({ token });
    if (!user) return res.send('<h3>Link inválido</h3>');
    
    user.verificado = true;
    user.token = undefined;
    await user.save();
    
    res.send('<div style="text-align:center;padding:40px;"><h2 style="color:#4CAF50;">Email confirmado! 🎉</h2></div>');
  } catch (err) {
    res.status(500).send('<h3>Erro</h3>');
  }
});

// 🔐 Login
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });
    if (!user.verificado) return res.status(403).json({ error: 'Email não verificado' });
    if (user.senha !== senha) return res.status(401).json({ error: 'Senha incorreta' });
    
    res.json({ message: 'Login realizado!', user: { nome: user.nome, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Erro no servidor.' });
  }
});

// 👥 Listar clientes (admin)
app.get('/admin/usuarios', verifyAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-senha -token').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🛍️ Listar produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await Product.find().sort({ createdAt: -1 });
    res.json(produtos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== ROTAS ADMIN ==================

// ➕ Adicionar produto
app.post('/api/admin/produtos', verifyAdmin, async (req, res) => {
  const { nome, preco, descricao, imagem, categoria } = req.body;
  if (!nome || !preco || !categoria || !imagem) {
    return res.status(400).json({ error: 'Campos obrigatórios' });
  }
  
  try {
    const novo = new Product({
      nome,
      preco: parseFloat(preco),
      precoOriginal: parseFloat(preco) * 1.43,
      descricao,
      imagem,
      categoria
    });
    await novo.save();
    res.json({ message: 'Produto adicionado!', produto: novo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✏️ Editar produto
app.put('/api/admin/produtos/:id', verifyAdmin, async (req, res) => {
  const { nome, preco, descricao, imagem, categoria } = req.body;
  try {
    const atualizado = await Product.findByIdAndUpdate(
      req.params.id,
      {
        nome,
        preco: parseFloat(preco),
        precoOriginal: parseFloat(preco) * 1.43,
        descricao,
        imagem,
        categoria
      },
      { new: true }
    );
    if (!atualizado) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ message: 'Produto atualizado!', produto: atualizado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🗑️ Remover produto
app.delete('/api/admin/produtos/:id', verifyAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== INICIALIZAÇÃO ==================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => console.error('❌ Erro:', err.message));