const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // arquivos estáticos (seu index.html)

// Pastas
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = path.join(DATA_DIR, 'usuarios.json');
const PEDIDOS_FILE = path.join(DATA_DIR, 'pedidos.json');

// Funções de leitura/escrita
const readData = (file) => {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

const writeData = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Transporter Nodemailer (Gmail)
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: 'caio1developer@gmail.com', // SEU EMAIL
    pass: 'fcrl vcki zbqj qawp'     // SENHA DE APP 
  }
});

// ================== ROTAS ==================

// Cadastro com verificação
app.post('/register', (req, res) => {
  const { nome, email, telefone, senha } = req.body;

  const usuarios = readData(USERS_FILE);
  if (usuarios.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email já cadastrado' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const user = { nome, email, telefone, senha, token, verificado: false };

  usuarios.push(user);
  writeData(USERS_FILE, usuarios);

  // Enviar email de verificação
  const link = `http://localhost:3000/confirmar?token=${token}`;
  const mailOptions = {
    to: email,
    subject: 'Confirme seu cadastro no Sem Censura',
    html: `<h2>Olá, ${nome}!</h2>
           <p>Obrigado por se cadastrar. Clique no link abaixo para confirmar seu email:</p>
           <a href="${link}" target="_blank">${link}</a>`
  };

  transporter.sendMail(mailOptions, (err) => {
    if (err) console.log('Erro ao enviar email:', err);
  });

  res.json({ message: 'Cadastro realizado! Verifique seu email.' });
});

// Confirmar email
app.get('/confirmar', (req, res) => {
  const { token } = req.query;
  const usuarios = readData(USERS_FILE);
  const user = usuarios.find(u => u.token === token);

  if (!user) return res.send('<h3>Link inválido ou expirado.</h3>');

  user.verificado = true;
  writeData(USERS_FILE, usuarios);

  res.send('<h3>Email confirmado com sucesso! Você já pode fazer login.</h3>');
});

// Login
app.post('/login', (req, res) => {
  const { email, senha } = req.body;
  const usuarios = readData(USERS_FILE);
  const user = usuarios.find(u => u.email === email && u.senha === senha);

  if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });
  if (!user.verificado) return res.status(403).json({ error: 'Email não verificado' });

  res.json({ message: 'Login bem-sucedido', user });
});

// Finalizar compra
app.post('/create_preference', (req, res) => {
  const { items, usuario, codigoIndicacao } = req.body;

  // Salvar pedido
  const pedidos = readData(PEDIDOS_FILE);
  const pedido = {
    id: Date.now().toString(),
    usuario,
    itens: items,
    codigoIndicacao,
    data: new Date().toISOString(),
    status: 'pendente'
  };
  pedidos.push(pedido);
  writeData(PEDIDOS_FILE, pedidos);

  // Aqui você integraria com o Mercado Pago de verdade
  res.json({ id: 'MP-' + pedido.id });
});

// Dashboard (só para você)
app.get('/admin/usuarios', (req, res) => {
  const usuarios = readData(USERS_FILE);
  res.json(usuarios);
});

app.get('/admin/pedidos', (req, res) => {
  const pedidos = readData(PEDIDOS_FILE);
  res.json(pedidos);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});