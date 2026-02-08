const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path'); // IMPORTANTE: Adicionado para gerir caminhos de ficheiros

const app = express();

// Aumentar o limite para suportar imagens grandes em Base64
app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));
app.use(cors());

// --- CONFIGURAÇÃO PARA SERVIR O SITE HTML ---
// Esta linha diz ao servidor para entregar os teus ficheiros (index.html, css, imagens, etc.)
app.use(express.static(path.join(__dirname)));

// Configuração da Base de Dados PostgreSQL do Render
const pool = new Pool({
  connectionString: 'postgresql://garmotor_db_user:bwMHap8eQ1hkRgYDkP9IFLYOO2Nh2rZE@dpg-d63uagq4d50c73e10640-a.frankfurt-postgres.render.com/garmotor_db',
  ssl: {
    rejectUnauthorized: false
  }
});

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tiagoalvessampaio12@gmail.com',
        pass: 'fdypmpuinyowotba'
    }
});

// --- ROTA PRINCIPAL (Resolve o erro "Cannot GET /") ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- AUTENTICAÇÃO E UTILIZADORES ---

// ROTA DE REGISTO
app.post('/api/registar', async (req, res) => {
    try {
        const { nome, email, pass } = req.body; 
        const client = await pool.connect();
        
        const userCheck = await client.query('SELECT id FROM Vendedores WHERE Email = $1', [email]);
        
        if (userCheck.rows.length > 0) {
            client.release();
            return res.status(400).json({ mensagem: "Este e-mail já está registado." });
        }

        let nomeFinal = nome;
        let tipoFinal = 'Cliente';

        if (email.toLowerCase() === 'tiagoalvessampaio12@gmail.com') {
            nomeFinal = 'GARMOTOR';
            tipoFinal = 'Admin';
        }

        await client.query(
            'INSERT INTO Vendedores (Nome, Email, Senha, EmailConfirmado, Tipo) VALUES ($1, $2, $3, 0, $4)',
            [nomeFinal, email, pass, tipoFinal]
        );
        client.release();

        const token = Buffer.from(email).toString('base64');
        
        // ATUALIZADO: Usando o teu link correto do Render
        const link = `https://garmotor.onrender.com/api/confirmar/${token}`;

        await transporter.sendMail({
            from: '"GARMOTOR" <tiagoalvessampaio12@gmail.com>',
            to: email,
            subject: 'Ativa a tua conta - GARMOTOR',
            html: `<h2>Olá ${nomeFinal}!</h2>
                   <p>Clica no link abaixo para ativares a tua conta:</p>
                   <a href="${link}" style="padding:10px 20px; background:#007aff; color:white; text-decoration:none; border-radius:5px;">ATIVAR CONTA</a>`
        });

        res.json({ mensagem: "Conta criada! Verifica o e-mail para ativar." });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ mensagem: "Erro ao registar utilizador." }); 
    }
});

// ROTA DE LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT Nome, Email, Tipo, EmailConfirmado FROM Vendedores WHERE Email = $1 AND Senha = $2',
            [req.body.email, req.body.pass]
        );
        client.release();

        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (user.emailconfirmado == 0) { 
                return res.status(403).json({ mensagem: "Conta não ativada! Verifica o teu e-mail." });
            }
            res.json({ nome: user.nome, email: user.email, tipo: user.tipo });
        } else {
            res.status(401).json({ mensagem: "E-mail ou senha incorretos." });
        }
    } catch (err) { 
        res.status(500).json({ mensagem: "Erro no servidor." }); 
    }
});

// Confirmação de Email
app.get('/api/confirmar/:token', async (req, res) => {
    try {
        const email = Buffer.from(req.params.token, 'base64').toString('ascii');
        const client = await pool.connect();
        await client.query('UPDATE Vendedores SET EmailConfirmado = 1 WHERE Email = $1', [email]);
        client.release();
        
        res.send(`<div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                    <h1 style="color:#28a745;">✅ Conta Ativada!</h1>
                    <p>Já podes voltar ao site e fazer login.</p>
                    <a href="https://garmotor.onrender.com" style="color:#007aff;">Voltar ao site</a>
                  </div>`);
    } catch (err) { res.status(500).send("Erro na ativação."); }
});

// --- GESTÃO DE VEÍCULOS ---

app.get('/api/veiculos', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM Veiculos ORDER BY Id DESC');
        client.release();
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/veiculos/adicionar', async (req, res) => {
    try {
        const d = req.body;
        const client = await pool.connect();
        
        const vendedor = await client.query('SELECT Id, Tipo FROM Vendedores WHERE Email = $1', [d.vendedorEmail]);

        if (vendedor.rows.length > 0 && vendedor.rows[0].tipo === 'Admin') {
            await client.query(
                `INSERT INTO Veiculos (VendedorId, Marca, Modelo, Ano, Kms, Combustivel, Caixa, Cor, Preco, Descricao, ImagemCapa) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [vendedor.rows[0].id, d.marca, d.modelo, d.ano, d.kms, d.combustivel, d.caixa, d.cor, d.preco, d.descricao, d.imagens]
            );
            client.release();
            res.json({ mensagem: "Veículo adicionado com sucesso!" });
        } else { 
            client.release();
            res.status(403).json({ mensagem: "Acesso negado." }); 
        }
    } catch (err) { res.status(500).json({ mensagem: "Erro: " + err.message }); }
});

app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT V.*, Vend.Nome as VendedorNome FROM Veiculos V LEFT JOIN Vendedores Vend ON V.VendedorId = Vend.Id WHERE V.Id = $1',
            [req.params.id]
        );
        client.release();
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(404).send("Não encontrado.");
    } catch (err) { res.status(500).send(err.message); }
});

const PORT = process.env.PORT || 10000; // Alterado para 10000 (padrão Render)
app.listen(PORT, () => console.log(`🚀 SERVIDOR GARMOTOR LIGADO NA PORTA ${PORT}`));