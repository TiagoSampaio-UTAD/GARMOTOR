const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use(cors());

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// Rota raiz (abre o site)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Base de dados
const pool = new Pool({
    connectionString: 'postgresql://garmotor_db_user:bwMHap8eQ1hkRgYDkP9IFLYOO2Nh2rZE@dpg-d63uagq4d50c73e10640-a.frankfurt-postgres.render.com/garmotor_db',
    ssl: { rejectUnauthorized: false }
});

// --- API DE VEÍCULOS ---

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
