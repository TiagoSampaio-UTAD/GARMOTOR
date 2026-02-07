const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const app = express();

// Aumentar o limite para suportar imagens grandes em Base64
app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));
app.use(cors());

// Configuração da Base de Dados
const dbConfig = {
    user: 'sa',
    password: 'Garmotor2026!',
    server: 'localhost',
    database: 'GARMOTOR',
    options: { encrypt: false, trustServerCertificate: true },
    port: 1433
};

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tiagoalvessampaio12@gmail.com',
        pass: 'fdypmpuinyowotba' // O código que geraste, tudo junto
    }
});

// --- AUTENTICAÇÃO E UTILIZADORES ---

// Registo: Agora aceita Nome e força o Tipo "Cliente"
// --- ROTA DE REGISTO ---
app.post('/api/registar', async (req, res) => {
    try {
        const { nome, email, pass } = req.body; 
        let pool = await sql.connect(dbConfig);
        
        // Verifica se o email já existe
        let userCheck = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT Id FROM Vendedores WHERE Email = @email');
        
        if (userCheck.recordset.length > 0) {
            return res.status(400).json({ mensagem: "Este e-mail já está registado." });
        }

        // LÓGICA DE NOME: Se for o teu email, o nome é GARMOTOR e é Admin.
        // Se for qualquer outro, usa o nome do formulário e é Cliente.
        let nomeFinal = nome;
        let tipoFinal = 'Cliente';

        if (email.toLowerCase() === 'tiagoalvessampaio12@gmail.com') {
            nomeFinal = 'GARMOTOR';
            tipoFinal = 'Admin';
        }

        // Inserir na base de dados com as definições automáticas
        await pool.request()
            .input('n', sql.NVarChar, nomeFinal)
            .input('e', sql.NVarChar, email)
            .input('s', sql.NVarChar, pass)
            .input('t', sql.NVarChar, tipoFinal) 
            .query('INSERT INTO Vendedores (Nome, Email, Senha, EmailConfirmado, Tipo) VALUES (@n, @e, @s, 0, @t)');

        const token = Buffer.from(email).toString('base64');
        const link = `http://localhost:3000/api/confirmar/${token}`;

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

// --- ROTA DE LOGIN ---
app.post('/api/login', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('email', sql.NVarChar, req.body.email)
            .input('pass', sql.NVarChar, req.body.pass)
            .query('SELECT Nome, Email, Tipo, EmailConfirmado FROM Vendedores WHERE Email = @email AND Senha = @pass');

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            
            if (user.EmailConfirmado == 0) {
                return res.status(403).json({ mensagem: "Conta não ativada! Verifica o teu e-mail." });
            }
            
            // Retorna tudo o que o Index.html precisa para a função verificarSessao()
            res.json({ 
                nome: user.Nome, 
                email: user.Email, 
                tipo: user.Tipo 
            });
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
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('e', sql.NVarChar, email)
            .query('UPDATE Vendedores SET EmailConfirmado = 1 WHERE Email = @e');
        
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1 style="color:#28a745;">✅ Conta Ativada!</h1>
                <p>Já podes voltar ao site e fazer login.</p>
                <a href="Index.html">Ir para o Login</a>
            </div>
        `);
    } catch (err) { 
        res.status(500).send("Erro na ativação da conta."); 
    }
});

// --- GESTÃO DE VEÍCULOS ---

// Listar todos os veículos
app.get('/api/veiculos', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query('SELECT * FROM Veiculos ORDER BY Id DESC');
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

// Adicionar Veículo (Apenas para Admins no Dashboard)
app.post('/api/veiculos/adicionar', async (req, res) => {
    try {
        const d = req.body;
        let pool = await sql.connect(dbConfig);
        
        // Verifica se quem está a adicionar é realmente um Admin
        let vendedor = await pool.request()
            .input('email', sql.NVarChar, d.vendedorEmail)
            .query('SELECT Id, Tipo FROM Vendedores WHERE Email = @email');

        if (vendedor.recordset.length > 0 && vendedor.recordset[0].Tipo === 'Admin') {
            await pool.request()
                .input('vId', sql.Int, vendedor.recordset[0].Id)
                .input('ma', sql.NVarChar, d.marca)
                .input('mo', sql.NVarChar, d.modelo)
                .input('an', sql.Int, d.ano)
                .input('km', sql.Int, d.kms)
                .input('co', sql.NVarChar, d.combustivel)
                .input('ca', sql.NVarChar, d.caixa)
                .input('cr', sql.NVarChar, d.cor)
                .input('pr', sql.Decimal(10,2), d.preco)
                .input('desc', sql.NVarChar(sql.MAX), d.descricao)
                .input('im', sql.NVarChar(sql.MAX), d.imagens)
                .query(`INSERT INTO Veiculos (VendedorId, Marca, Modelo, Ano, Kms, Combustivel, Caixa, Cor, Preco, Descricao, ImagemCapa) 
                        VALUES (@vId, @ma, @mo, @an, @km, @co, @ca, @cr, @pr, @desc, @im)`);
            
            res.json({ mensagem: "Veículo adicionado com sucesso!" });
        } else { 
            res.status(403).json({ mensagem: "Acesso negado. Apenas administradores podem adicionar veículos." }); 
        }
    } catch (err) { 
        res.status(500).json({ mensagem: "Erro ao salvar veículo: " + err.message }); 
    }
});

// Ver detalhes de um veículo específico
app.get('/api/veiculos/:id', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT V.*, Vend.Nome as VendedorNome FROM Veiculos V LEFT JOIN Vendedores Vend ON V.VendedorId = Vend.Id WHERE V.Id = @id');
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).send("Veículo não encontrado.");
        }
    } catch (err) { res.status(500).send(err.message); }
});

app.listen(3000, () => console.log("🚀 SERVIDOR GARMOTOR LIGADO NA PORTA 3000"));