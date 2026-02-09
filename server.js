const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

// --- CONFIGURAÇÃO E MIDDLEWARES ---
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

// Servir os ficheiros estáticos da raiz
app.use(express.static(__dirname));

// --- CONEXÃO À BASE DE DADOS (PostgreSQL) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://garmotor_db_user:bwMHap8eQ1hkRgYDkP9IFLYOO2Nh2rZE@dpg-d63uagq4d50c73e10640-a.frankfurt-postgres.render.com/garmotor_db',
    ssl: { rejectUnauthorized: false }
});

// --- AUTO-INSTALADOR (CRIA TABELAS AUTOMATICAMENTE) ---
const inicializarBancoDeDados = async () => {
    try {
        console.log('Verificando estrutura da base de dados...');

        // 1. Criar Tabela de Vendedores
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Vendedores (
                Id SERIAL PRIMARY KEY,
                Nome VARCHAR(255) NOT NULL,
                Email VARCHAR(255) UNIQUE NOT NULL,
                Senha VARCHAR(255) NOT NULL,
                EmailConfirmado INT DEFAULT 0,
                Tipo VARCHAR(50) DEFAULT 'Cliente'
            );
        `);

        // 2. Criar Tabela de Veículos
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

        // 3. Garantir que a coluna "Estado" existe (caso a tabela tenha sido criada antes)
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='veiculos' AND column_name='estado') THEN
                    ALTER TABLE Veiculos ADD COLUMN Estado VARCHAR(20) DEFAULT 'Disponível';
                END IF;
            END $$;
        `);

        // 4. Inserir Administrador Padrão
        const queryAdmin = `
            INSERT INTO Vendedores (Nome, Email, Senha, EmailConfirmado, Tipo)
            VALUES ('GARMOTOR', 'tiagoalvessampaio12@gmail.com', 'Tiago1.', 1, 'Admin')
            ON CONFLICT (Email) DO NOTHING;
        `;
        await pool.query(queryAdmin);

        console.log('>>> Base de dados configurada e pronta!');
    } catch (err) {
        console.error('Erro ao inicializar base de dados:', err);
    }
};

// Executa a inicialização
inicializarBancoDeDados();

// --- ROTAS DO FRONTEND ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

// --- API DE UTILIZADORES ---

app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        const query = 'SELECT * FROM Vendedores WHERE Email = $1 AND Senha = $2';
        const resultado = await pool.query(query, [email, pass]);

        if (resultado.rows.length > 0) {
            const user = resultado.rows[0];
            res.json({
                nome: user.nome || user.Nome,
                email: user.email || user.Email,
                tipo: user.tipo || user.Tipo
            });
        } else {
            res.status(401).json({ mensagem: "E-mail ou senha incorretos." });
        }
    } catch (err) {
        res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
});

app.post('/api/registar', async (req, res) => {
    try {
        const { nome, email, pass } = req.body;
        const existe = await pool.query('SELECT * FROM Vendedores WHERE Email = $1', [email]);
        if (existe.rows.length > 0) return res.status(400).json({ mensagem: "E-mail já registado." });

        const tipo = (email.toLowerCase() === 'tiagoalvessampaio12@gmail.com') ? 'Admin' : 'Vendedor';
        const query = `INSERT INTO Vendedores (Nome, Email, Senha, Tipo, EmailConfirmado) VALUES ($1, $2, $3, $4, 1) RETURNING Nome, Email, Tipo`;
        
        const resultado = await pool.query(query, [nome, email, pass, tipo]);
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao criar conta." });
    }
});

// --- API DE VEÍCULOS ---

app.get('/api/veiculos', async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM Veiculos ORDER BY Id DESC");
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM Veiculos WHERE Id = $1", [req.params.id]);
        if (resultado.rows.length === 0) return res.status(404).json({ mensagem: "Não encontrado." });
        res.json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/veiculos/adicionar', async (req, res) => {
    try {
        const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado } = req.body;
        const query = `
            INSERT INTO Veiculos 
            (VendedorId, Marca, Modelo, Preco, Ano, Kms, Combustivel, Caixa, Cor, Descricao, ImagemCapa, Estado)
            VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;
        const values = [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado || 'Disponível'];
        const resultado = await pool.query(query, values);
        res.status(201).json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar veículo." });
    }
});

app.put('/api/veiculos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado } = req.body;
        const query = `
            UPDATE Veiculos SET
                Marca=$1, Modelo=$2, Preco=$3, Ano=$4, Kms=$5,
                Combustivel=$6, Caixa=$7, Cor=$8, Descricao=$9, ImagemCapa=$10, Estado=$11
            WHERE Id=$12
        `;
        await pool.query(query, [marca, modelo, preco, ano, kms, combustivel, caixa, cor, descricao, imagemCapa, estado, id]);
        res.json({ mensagem: "Atualizado com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar." });
    }
});

app.delete('/api/veiculos/:id', async (req, res) => {
    try {
        const resultado = await pool.query("DELETE FROM Veiculos WHERE Id = $1", [req.params.id]);
        if (resultado.rowCount === 0) return res.status(404).json({ mensagem: "Não encontrado." });
        res.json({ mensagem: "Eliminado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao apagar." });
    }
});

// --- INICIALIZAÇÃO ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`>>> GARMOTOR Backend Online na porta ${PORT}`);
});