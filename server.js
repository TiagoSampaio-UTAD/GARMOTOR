const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt'); // NOVO: Para encriptar
const nodemailer = require('nodemailer'); // NOVO: Para enviar emails
const crypto = require('crypto'); // Nativo do Node para gerar tokens

const app = express();

// --- CONFIGURAÇÃO ---
app.use(express.json({ limit: '50mb' })); // Reduzi um pouco por segurança
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static(__dirname));

// --- BASE DE DADOS ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://garmotor_db_user:bwMHap8eQ1hkRgYDkP9IFLYOO2Nh2rZE@dpg-d63uagq4d50c73e10640-a.frankfurt-postgres.render.com/garmotor_db',
    ssl: { rejectUnauthorized: false }
});

// --- CONFIGURAÇÃO DE EMAIL (NODEMAILER) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true para porta 465, false para outras
    auth: {
        user: 'tiagoalvessampaio12@gmail.com',
        pass: 'ncai rwly bqnx hpxa' // Mantém a tua app password aqui
    },
    tls: {
        rejectUnauthorized: false // Ajuda a evitar erros de certificado no Render
    },
    connectionTimeout: 10000, // 10 segundos de limite
    greetingTimeout: 5000,
    socketTimeout: 10000
});

// --- INICIALIZAÇÃO DA BD ---
const inicializarBancoDeDados = async () => {
    try {
        // Criar Tabela Vendedores (com colunas de reset)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Vendedores (
                Id SERIAL PRIMARY KEY,
                Nome VARCHAR(255) NOT NULL,
                Email VARCHAR(255) UNIQUE NOT NULL,
                Senha VARCHAR(255) NOT NULL,
                EmailConfirmado INT DEFAULT 0,
                Tipo VARCHAR(50) DEFAULT 'Cliente',
                ResetToken VARCHAR(255),
                ResetTokenExpires BIGINT
            );
        `);

        // Tentar adicionar colunas se a tabela já existir (caso não tenhas corrido o SQL manual)
        try {
            await pool.query("ALTER TABLE Vendedores ADD COLUMN IF NOT EXISTS ResetToken VARCHAR(255)");
            await pool.query("ALTER TABLE Vendedores ADD COLUMN IF NOT EXISTS ResetTokenExpires BIGINT");
        } catch (e) { /* Ignorar se já existirem */ }

        // Criar Tabela Veículos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Veiculos (
                Id SERIAL PRIMARY KEY,
                VendedorId INT NOT NULL,
                Marca VARCHAR(50),
                Modelo VARCHAR(50),
                Ano INT,
                Kms INT,
                Combustivel VARCHAR(30),
                Caixa VARCHAR(30),
                Cor VARCHAR(30),
                Preco DECIMAL(10, 2),
                Descricao TEXT,
                ImagemCapa TEXT, 
                Estado VARCHAR(20) DEFAULT 'Disponível',
                DataPublicacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT FK_VendedorVeiculo FOREIGN KEY (VendedorId) REFERENCES Vendedores(Id) ON DELETE CASCADE
            );
        `);

        // Cria Admin se não existir (AGORA COM HASH)
        // Nota: A senha aqui é 'Garmotor2026!'
        const hashAdmin = await bcrypt.hash('Garmotor2026!', 10);
        const queryAdmin = `
            INSERT INTO Vendedores (Nome, Email, Senha, EmailConfirmado, Tipo)
            VALUES ('GARMOTOR', 'tiagoalvessampaio12@gmail.com', $1, 1, 'Admin')
            ON CONFLICT (Email) DO NOTHING;
        `;
        await pool.query(queryAdmin, [hashAdmin]);

        console.log('>>> Base de dados pronta e segura!');
    } catch (err) {
        console.error('Erro DB:', err);
    }
};

inicializarBancoDeDados();

// --- ROTAS DE PÁGINAS ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Index.html')));

// --- LOGIN SEGURO (COM HASH) ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        const query = 'SELECT * FROM Vendedores WHERE Email = $1';
        const resultado = await pool.query(query, [email]);

        if (resultado.rows.length > 0) {
            const user = resultado.rows[0];
            // Compara a senha escrita com o Hash da BD
            const match = await bcrypt.compare(pass, user.senha || user.Senha);
            
            if (match) {
                res.json({
                    nome: user.nome || user.Nome,
                    email: user.email || user.Email,
                    tipo: user.tipo || user.Tipo
                });
            } else {
                res.status(401).json({ mensagem: "Senha incorreta." });
            }
        } else {
            res.status(401).json({ mensagem: "Utilizador não encontrado." });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensagem: "Erro no servidor." });
    }
});

// --- REGISTO SEGURO (COM HASH) ---
// Útil se quiseres criar outros vendedores no futuro
app.post('/api/registar', async (req, res) => {
    try {
        const { nome, email, pass } = req.body;
        // Encriptar senha antes de guardar
        const hash = await bcrypt.hash(pass, 10);
        
        const query = `INSERT INTO Vendedores (Nome, Email, Senha, Tipo, EmailConfirmado) VALUES ($1, $2, $3, 'Vendedor', 1) RETURNING Nome`;
        await pool.query(query, [nome, email, hash]);
        
        res.status(201).json({ mensagem: "Criado com sucesso" });
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao criar conta." });
    }
});

// --- RECUPERAÇÃO DE SENHA: PASSO 1 (PEDIR O EMAIL) ---
app.post('/api/recuperar-senha', async (req, res) => {
    const { email } = req.body;
    console.log(">>> Pedido de recuperação para:", email); // LOG 1

    try {
        const user = await pool.query("SELECT * FROM Vendedores WHERE Email = $1", [email]);
        if (user.rows.length === 0) {
            console.log(">>> Email não encontrado na base de dados.");
            return res.status(404).json({ mensagem: "Email não registado." });
        }

        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 3600000;

        await pool.query("UPDATE Vendedores SET ResetToken = $1, ResetTokenExpires = $2 WHERE Email = $3", [token, expires, email]);
        console.log(">>> Token gerado e guardado com sucesso."); // LOG 2

        const domain = req.headers.host; 
        const protocol = req.headers['x-forwarded-proto'] || 'http'; 
        const link = `${protocol}://${domain}/ResetPassword.html?token=${token}`;

        const mailOptions = {
            to: email,
            from: '"GARMOTOR" <tiagoalvessampaio12@gmail.com>',
            subject: 'Alteração de Password - GARMOTOR',
            html: `<h2>Recuperação de Acesso</h2><p>Clica no link: <a href="${link}">${link}</a></p>`
        };

        console.log(">>> A tentar enviar email..."); // LOG 3
        await transporter.sendMail(mailOptions);
        console.log(">>> EMAIL ENVIADO COM SUCESSO!"); // LOG 4
        
        res.json({ mensagem: "Email enviado! Verifica a tua caixa de correio." });

    } catch (err) {
        console.error(">>> ERRO CRÍTICO NO ENVIO:", err.message); // LOG DE ERRO
        res.status(500).json({ mensagem: "Erro ao enviar email: " + err.message });
    }
});

// --- RECUPERAÇÃO DE SENHA: PASSO 2 (ALTERAR A PASSWORD) ---
app.post('/api/reset-senha-final', async (req, res) => {
    const { token, novaSenha } = req.body;
    try {
        // Verificar se token existe e não expirou
        const query = "SELECT * FROM Vendedores WHERE ResetToken = $1 AND ResetTokenExpires > $2";
        const user = await pool.query(query, [token, Date.now()]);

        if (user.rows.length === 0) {
            return res.status(400).json({ mensagem: "Link inválido ou expirado." });
        }

        // Encriptar nova senha
        const novoHash = await bcrypt.hash(novaSenha, 10);

        // Atualizar senha e limpar token
        await pool.query(
            "UPDATE Vendedores SET Senha = $1, ResetToken = NULL, ResetTokenExpires = NULL WHERE Id = $2",
            [novoHash, user.rows[0].id || user.rows[0].Id]
        );

        res.json({ mensagem: "Password alterada com sucesso! Podes fazer login." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ mensagem: "Erro ao alterar password." });
    }
});

// --- ROTAS DE VEÍCULOS (MANTIDAS) ---
app.get('/api/veiculos', async (req, res) => {
    const resultado = await pool.query("SELECT * FROM Veiculos ORDER BY Id DESC");
    res.json(resultado.rows);
});

app.get('/api/veiculos/:id', async (req, res) => {
    const resultado = await pool.query("SELECT * FROM Veiculos WHERE Id = $1", [req.params.id]);
    res.json(resultado.rows[0]);
});

app.post('/api/veiculos/adicionar', async (req, res) => {
    const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado } = req.body;
    const query = `INSERT INTO Veiculos (VendedorId, Marca, Modelo, Preco, Ano, Kms, Combustivel, Caixa, Cor, Descricao, ImagemCapa, Estado) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const resultado = await pool.query(query, [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado || 'Disponível']);
    res.status(201).json(resultado.rows[0]);
});

app.put('/api/veiculos/:id', async (req, res) => {
    const { id } = req.params;
    const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado } = req.body;
    const query = `UPDATE Veiculos SET Marca=$1, Modelo=$2, Preco=$3, Ano=$4, Kms=$5, Combustivel=$6, Caixa=$7, Cor=$8, Descricao=$9, ImagemCapa=$10, Estado=$11 WHERE Id=$12`;
    await pool.query(query, [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado, id]);
    res.json({ success: true });
});

app.delete('/api/veiculos/:id', async (req, res) => {
    await pool.query("DELETE FROM Veiculos WHERE Id = $1", [req.params.id]);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GARMOTOR Online: ${PORT}`));