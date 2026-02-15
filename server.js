const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt'); 
const nodemailer = require('nodemailer'); 
const crypto = require('crypto'); 

const app = express();

// --- CONFIGURAÇÃO ---
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static(__dirname));

// --- BASE DE DADOS ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://garmotor_db_user:bwMHap8eQ1hkRgYDkP9IFLYOO2Nh2rZE@dpg-d63uagq4d50c73e10640-a.frankfurt-postgres.render.com/garmotor_db',
    ssl: { rejectUnauthorized: false }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Ele vai buscar ao Render
        pass: process.env.EMAIL_PASS  // Ele vai buscar ao Render
    },
    family: 4, 
    tls: { rejectUnauthorized: false }
});

// Diagnóstico importante
transporter.verify(function (error, success) {
    if (error) {
        console.log(">>> [ERRO] Falha no Gmail: " + error.message);
    } else {
        console.log(">>> [OK] Servidor pronto para enviar emails!");
    }
});

// --- INICIALIZAÇÃO DA BD ---
const inicializarBancoDeDados = async () => {
    try {
        // Criar Tabela Vendedores
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

        // Garantir que colunas de reset existem
        try {
            await pool.query("ALTER TABLE Vendedores ADD COLUMN IF NOT EXISTS ResetToken VARCHAR(255)");
            await pool.query("ALTER TABLE Vendedores ADD COLUMN IF NOT EXISTS ResetTokenExpires BIGINT");
        } catch (e) { }

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

        // Criar Admin padrão com Password Encriptada
        const hashAdmin = await bcrypt.hash('Garmotor2026!', 10);
        const queryAdmin = `
            INSERT INTO Vendedores (Nome, Email, Senha, EmailConfirmado, Tipo)
            VALUES ('GARMOTOR', 'tiagoalvessampaio12@gmail.com', $1, 1, 'Admin')
            ON CONFLICT (Email) DO UPDATE SET Senha = EXCLUDED.Senha;
        `;
        await pool.query(queryAdmin, [hashAdmin]);

        console.log('>>> Base de dados e Admin configurados com sucesso!');
    } catch (err) {
        console.error('Erro ao inicializar DB:', err);
    }
};

inicializarBancoDeDados();

// --- ROTAS ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Index.html')));

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        const resultado = await pool.query('SELECT * FROM Vendedores WHERE Email = $1', [email]);

        if (resultado.rows.length > 0) {
            const user = resultado.rows[0];
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
        res.status(500).json({ mensagem: "Erro no servidor." });
    }
});

// RECUPERAÇÃO DE SENHA (PEDIDO)
app.post('/api/recuperar-senha', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await pool.query("SELECT * FROM Vendedores WHERE Email = $1", [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ mensagem: "Email não registado." });
        }

        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 3600000; // 1 hora

        await pool.query("UPDATE Vendedores SET ResetToken = $1, ResetTokenExpires = $2 WHERE Email = $3", [token, expires, email]);

        const domain = req.headers.host; 
        const protocol = req.headers['x-forwarded-proto'] || 'http'; 
        const link = `${protocol}://${domain}/ResetPassword.html?token=${token}`;

        const mailOptions = {
            to: email,
            from: '"GARMOTOR" <tiagoalvessampaio12@gmail.com>',
            subject: 'Alteração de Password - GARMOTOR',
            html: `<h2>Recuperação de Acesso</h2><p>Clique no link para definir uma nova senha: <a href="${link}">${link}</a></p>`
        };

        await transporter.sendMail(mailOptions);
        res.json({ mensagem: "Email enviado! Verifique a sua caixa de correio." });

    } catch (err) {
        console.error("ERRO NO ENVIO:", err.message);
        res.status(500).json({ mensagem: "Erro ao enviar email. Tente novamente." });
    }
});

// RESET FINAL DE SENHA
app.post('/api/reset-senha-final', async (req, res) => {
    const { token, novaSenha } = req.body;
    try {
        const query = "SELECT * FROM Vendedores WHERE ResetToken = $1 AND ResetTokenExpires > $2";
        const user = await pool.query(query, [token, Date.now()]);

        if (user.rows.length === 0) {
            return res.status(400).json({ mensagem: "Link inválido ou expirado." });
        }

        const novoHash = await bcrypt.hash(novaSenha, 10);

        await pool.query(
            "UPDATE Vendedores SET Senha = $1, ResetToken = NULL, ResetTokenExpires = NULL WHERE Id = $2",
            [novoHash, user.rows[0].id || user.rows[0].Id]
        );

        res.json({ mensagem: "Password alterada com sucesso!" });
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao alterar password." });
    }
});

// VEÍCULOS
app.get('/api/veiculos', async (req, res) => {
    const resultado = await pool.query("SELECT * FROM Veiculos ORDER BY Id DESC");
    res.json(resultado.rows);
});

app.post('/api/veiculos/adicionar', async (req, res) => {
    const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado } = req.body;
    const query = `INSERT INTO Veiculos (VendedorId, Marca, Modelo, Preco, Ano, Kms, Combustivel, Caixa, Cor, Descricao, ImagemCapa, Estado) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const resultado = await pool.query(query, [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado || 'Disponível']);
    res.status(201).json(resultado.rows[0]);
});

app.delete('/api/veiculos/:id', async (req, res) => {
    await pool.query("DELETE FROM Veiculos WHERE Id = $1", [req.params.id]);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GARMOTOR Online na porta ${PORT}`));