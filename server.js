require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Modelos
const userSchema = new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  telefone: String,
  senha: String,
  token: String,
  verificado: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const pedidoSchema = new mongoose.Schema({
  id: String,
  usuario: String,
  itens: Array,
  codigoIndicacao: String,
  data: String,
  status: String
});
const Pedido = mongoose.model('Pedido', pedidoSchema);

// Middleware
app.use(cors());
app.use(express.json());

// Transporter Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ================== ROTAS ==================

// Cadastro
app.post('/register', async (req, res) => {
  const { nome, email, telefone, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Preencha nome, email e senha.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const user = new User({ nome, email, telefone, senha, token, verificado: false });
    await user.save();

    const link = `https://semcensura-loja.onrender.com/confirmar?token=${token}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Confirme seu cadastro no Sem Censura',
      html: `<h2>Olá, ${nome}!</h2>
             <p>Obrigado por se cadastrar. Clique no link abaixo para confirmar seu email:</p>
             <a href="${link}" target="_blank">${link}</a>`
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Cadastro realizado! Verifique seu email.' });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Erro no servidor.' });
  }
});

// Confirmar email
app.get('/confirmar', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('<h3>Token não fornecido.</h3>');

  try {
    const user = await User.findOne({ token });
    if (!user) return res.send('<h3>Link inválido ou expirado.</h3>');

    user.verificado = true;
    await user.save();

    res.send(`
      <h3>Email confirmado com sucesso! 🎉</h3>
      <p>Você já pode fazer login.</p>
      <a href="https://caioolkk.github.io/semcensura-frontend/" style="color: #e91e63;">Voltar ao site</a>
    `);
  } catch (err) {
    console.error('Erro ao confirmar email:', err);
    res.status(500).send('<h3>Erro ao confirmar email.</h3>');
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });
    if (!user.verificado) return res.status(403).json({ error: 'Email não verificado.' });
    if (user.senha !== senha) return res.status(401).json({ error: 'Senha incorreta' });

    res.json({ message: 'Login bem-sucedido', user: { email: user.email, nome: user.nome } });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro no servidor.' });
  }
});

// Criar preferência do Mercado Pago
app.post('/create_preference', async (req, res) => {
  const { items, usuario, codigoIndicacao } = req.body;

  if (!items || !usuario) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  try {
    const pedido = new Pedido({
      id: Date.now().toString(),
      usuario,
      itens: items,
      codigoIndicacao: codigoIndicacao || 'sem código',
      data: new Date().toISOString(),
      status: 'pendente'
    });
    await pedido.save();

    const preferenceData = {
      items: items.map(item => ({
        title: item.name,
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        currency_id: 'BRL'
      })),
      payer: { email: usuario },
      back_urls: {
        success: 'https://caioolkk.github.io/semcensura-frontend/',
        failure: 'https://caioolkk.github.io/semcensura-frontend/',
        pending: 'https://caioolkk.github.io/semcensura-frontend/'
      },
      auto_return: 'approved',
      binary_mode: true
    };

    const response = await axios.post('https://api.mercadopago.com/checkout/preferences', preferenceData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
      }
    });

    res.json({ id: response.data.id });
  } catch (error) {
    console.error('Erro no Mercado Pago:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao processar pagamento.' });
  }
});

// Rotas de admin (opcional)
app.get('/admin/usuarios', async (req, res) => {
  const usuarios = await User.find();
  res.json(usuarios);
});

app.get('/admin/pedidos', async (req, res) => {
  const pedidos = await Pedido.find();
  res.json(pedidos);
});

// Rota de teste de email
app.get('/test-email', async (req, res) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'caiomacario017@gmail.com',
      subject: '📧 Teste de Envio - Loja Sem Censura',
      html: '<h2>Se você recebeu isso, o Nodemailer está funcionando!</h2><p>Parabéns, seu servidor consegue enviar emails!</p>'
    };

    await transporter.sendMail(mailOptions);
    res.send('✅ Email de teste enviado com sucesso!');
  } catch (error) {
    console.error('Erro ao enviar email de teste:', error);
    res.status(500).send(`❌ Falha ao enviar email: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔗 Conectado ao MongoDB Atlas`);
});