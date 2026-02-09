const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

// Middlewares
app.use(express.json({ limit: '100mb' }));
app.use(cors());

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Base de dados
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// -------- API DE VEÍCULOS --------

// LISTAR
app.get('/api/veiculos', async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM Veiculos ORDER BY Id DESC");
        res.json(r.rows);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// DETALHES
app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const r = await pool.query(
            "SELECT * FROM Veiculos WHERE Id=$1",
            [req.params.id]
        );
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// ADICIONAR
app.post('/api/veiculos/adicionar', async (req, res) => {
    try {
        const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa } = req.body;

        const r = await pool.query(`
            INSERT INTO Veiculos 
            (VendedorId, Marca, Modelo, Preco, Ano, Kms, Combustivel, Caixa, Cor, Descricao, ImagemCapa)
            VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa]);

        res.status(201).json({ mensagem: "Veículo publicado!" });
    } catch (e) {
        res.status(500).json({ erro: "Erro ao guardar veículo." });
    }
});

// EDITAR
app.put('/api/veiculos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa } = req.body;

        await pool.query(`
            UPDATE Veiculos SET
                Marca=$1, Modelo=$2, Preco=$3, Ano=$4, Kms=$5,
                Combustivel=$6, Caixa=$7, Cor=$8, Descricao=$9, ImagemCapa=$10
            WHERE Id=$11
        `, [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, id]);

        res.json({ mensagem: "Atualizado!" });
    } catch (e) {
        res.status(500).json({ erro: "Erro ao atualizar." });
    }
});

// APAGAR
app.delete('/api/veiculos/:id', async (req, res) => {
    try {
        const r = await pool.query(
            "DELETE FROM Veiculos WHERE Id=$1",
            [req.params.id]
        );

        if (r.rowCount === 0) {
            return res.status(404).json({ mensagem: "Veículo não encontrado." });
        }

        res.json({ mensagem: "Veículo eliminado!" });
    } catch (e) {
        res.status(500).json({ erro: "Erro ao apagar." });
    }
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`GARMOTOR online na porta ${PORT}`);
});
