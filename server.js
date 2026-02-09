const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use(cors());

// Servir frontend da raiz (onde os teus ficheiros estão)
app.use(express.static(__dirname));

// Rota raiz correta
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

// Base de dados
const pool = new Pool({
    connectionString: 'postgresql://garmotor_db_user:bwMHap8eQ1hkRgYDkP9IFLYOO2Nh2rZE@dpg-d63uagq4d50c73e10640-a.frankfurt-postgres.render.com/garmotor_db',
    ssl: { rejectUnauthorized: false }
});
// --- API DE UTILIZADORES (LOGIN E REGISTO) ---

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;

        // Procurar o utilizador na tabela Vendedores
        // Nota: No Postgres, os nomes das colunas sem aspas são tratados como minúsculas
        const query = 'SELECT * FROM Vendedores WHERE Email = $1 AND Senha = $2';
        const resultado = await pool.query(query, [email, pass]);

        if (resultado.rows.length > 0) {
            const user = resultado.rows[0];
            
            // Retorna exatamente o que o teu Authentication.html espera
            res.json({
                nome: user.nome || user.Nome,
                email: user.email || user.Email,
                tipo: user.tipo || user.Tipo
            });
        } else {
            res.status(401).json({ mensagem: "E-mail ou senha incorretos." });
        }
    } catch (err) {
        console.error("Erro no Login:", err);
        res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
});

// REGISTO (Opcional, caso precises de criar novos vendedores)
app.post('/api/registar', async (req, res) => {
    try {
        const { nome, email, pass } = req.body;

        // Verificar se já existe
        const existe = await pool.query('SELECT * FROM Vendedores WHERE Email = $1', [email]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ mensagem: "Este e-mail já está registado." });
        }

        // Definir como Admin se for o teu email, caso contrário Vendedor
        const tipo = (email.toLowerCase() === 'tiagoalvessampaio12@gmail.com') ? 'Admin' : 'Vendedor';

        const query = `
            INSERT INTO Vendedores (Nome, Email, Senha, Tipo, EmailConfirmado)
            VALUES ($1, $2, $3, $4, 1)
            RETURNING Nome, Email, Tipo
        `;
        
        const resultado = await pool.query(query, [nome, email, pass, tipo]);
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao criar conta." });
    }
});

// LISTAR TODOS
app.get('/api/veiculos', async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM Veiculos ORDER BY Id DESC");
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// OBTER UM
app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT * FROM Veiculos WHERE Id = $1",
            [req.params.id]
        );
        res.json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADICIONAR
app.post('/api/veiculos/adicionar', async (req, res) => {
    try {
        const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa } = req.body;

        const query = `
            INSERT INTO Veiculos 
            (VendedorId, Marca, Modelo, Preco, Ano, Kms, Combustivel, Caixa, Cor, Descricao, ImagemCapa)
            VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *
        `;

        const values = [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa];
        const resultado = await pool.query(query, values);

        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar veículo." });
    }
});

// EDITAR
app.put('/api/veiculos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa } = req.body;

        const query = `
            UPDATE Veiculos SET
                Marca=$1, Modelo=$2, Preco=$3, Ano=$4, Kms=$5,
                Combustivel=$6, Caixa=$7, Cor=$8, Descricao=$9, ImagemCapa=$10
            WHERE Id=$11
        `;

        await pool.query(query, [
            marca, modelo, preco, ano, kms,
            combustivel, caixa, cor, descricao, imagemCapa, id
        ]);

        res.json({ mensagem: "Atualizado com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar." });
    }
});

// APAGAR
app.delete('/api/veiculos/:id', async (req, res) => {
    try {
        const resultado = await pool.query(
            "DELETE FROM Veiculos WHERE Id = $1",
            [req.params.id]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({ mensagem: "Veículo não encontrado." });
        }

        res.json({ mensagem: "Veículo eliminado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao apagar veículo." });
    }
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
