require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt'); 
const crypto = require('crypto'); 

const app = express();

// --- CONFIGURAÇÃO ---
// Aumentar o limite é vital para aceitar as strings de fotos em Base64
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static(__dirname));

// --- CONEXÃO MONGODB ---
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
    .then(() => {
        console.log('>>> Conectado ao MongoDB Atlas com sucesso!');
        inicializarAdmin(); 
    })
    .catch(err => {
        console.error('Erro crítico ao conectar ao MongoDB:', err.message);
    });

// --- MODELOS ---
const VendedorSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    senha: { type: String, required: true },
    tipo: { type: String, default: 'Cliente' },
    resetToken: String,
    resetTokenExpires: Date
});
const Vendedor = mongoose.model('Vendedor', VendedorSchema, 'vendedores');

const VeiculoSchema = new mongoose.Schema({
    vendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendedor', required: true },
    marca: { type: String, required: true },
    modelo: { type: String, required: true },
    ano: { type: Number, required: true },
    kms: { type: Number, required: true },
    combustivel: { type: String, required: true },
    caixa: { type: String, required: true },
    portas: { type: String, required: true },
    cor: { type: String, required: true },
    preco: { type: String, required: true },
    equipamento: String, 
    descricao: String,
    imagemCapa: { type: String, required: true }, 
    estado: { type: String, default: 'Disponível' },
    dataPublicacao: { type: Date, default: Date.now }
});
const Veiculo = mongoose.model('Veiculo', VeiculoSchema, 'veiculos');

// --- INICIALIZAÇÃO ---
const inicializarAdmin = async () => {
    try {
        const senhaHash = await bcrypt.hash('Garmotor2026!', 10);

        // 1. Criar/Verificar Admin Principal
        const admin1 = await Vendedor.findOne({ email: 'tiagoalvessampaio12@gmail.com' });
        if (!admin1) {
            await Vendedor.create({
                nome: 'GARMOTOR',
                email: 'tiagoalvessampaio12@gmail.com',
                senha: senhaHash,
                tipo: 'Admin'
            });
            console.log('>>>Vendedor criado!');
        }

        // 2. Criar/Verificar Segundo Vendedor
        const admin2 = await Vendedor.findOne({ email: 'garmotor.automovel@gmail.com' });
        if (!admin2) {
            await Vendedor.create({
                nome: 'GARMOTOR',
                email: 'garmotor.automovel@gmail.com',
                senha: senhaHash,
                tipo: 'Admin' 
            });
            console.log('>>> Admin Garmotor criado!');
        }

    } catch (err) { 
        console.error('Erro ao inicializar utilizadores:', err); 
    }
};

// --- ROTAS DA API ---

// 1. LISTAR TODOS OS VEÍCULOS (Faltava esta rota!)
app.get('/api/veiculos', async (req, res) => {
    try {
        const veiculos = await Veiculo.find();
        res.json(veiculos);
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao procurar veículos" });
    }
});

// 2. BUSCAR UM VEÍCULO ESPECÍFICO
app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const veiculo = await Veiculo.findById(req.params.id);
        if (!veiculo) return res.status(404).json({ mensagem: "Não encontrado" });
        res.json(veiculo);
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao buscar detalhes." });
    }
});

// 3. ADICIONAR NOVO
app.post('/api/veiculos/adicionar', async (req, res) => {
    try {
        const novoVeiculo = new Veiculo(req.body);
        await novoVeiculo.save();
        res.status(201).json({ mensagem: "Publicado com sucesso!", id: novoVeiculo._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ mensagem: "Erro ao publicar no MongoDB." });
    }
});

// 4. ATUALIZAR
app.put('/api/veiculos/:id', async (req, res) => {
    try {
        const veiculo = await Veiculo.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!veiculo) return res.status(404).json({ mensagem: "Não encontrado." });
        res.json({ mensagem: "Atualizado com sucesso!" });
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao atualizar." });
    }
});

// 5. APAGAR
app.delete('/api/veiculos/:id', async (req, res) => {
    try {
        await Veiculo.findByIdAndDelete(req.params.id);
        res.json({ success: true, mensagem: "Removido!" });
    } catch (err) {
        res.status(500).json({ mensagem: "Erro ao apagar." });
    }
});

// 6. LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        const user = await Vendedor.findOne({ email });
        if (user && await bcrypt.compare(pass, user.senha)) {
            res.json({ 
                id: user._id, 
                nome: user.nome, 
                tipo: user.tipo,
                mensagem: "Sucesso" 
            });
        } else {
            res.status(401).json({ mensagem: "Dados incorretos." });
        }
    } catch (err) { res.status(500).json({ mensagem: "Erro no servidor." }); }
});

// 7. RECUPERAR SENHA
app.post('/api/recuperar-senha', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await Vendedor.findOne({ email });
        if (!user) return res.status(404).json({ mensagem: "Email não registado." });

        const token = crypto.randomBytes(20).toString('hex');
        user.resetToken = token;
        user.resetTokenExpires = Date.now() + 3600000;
        await user.save();

        const link = `http://${req.headers.host}/ResetUser.html?token=${token}`;
        res.json({ link, email: user.email });
    } catch (err) { res.status(500).json({ mensagem: "Erro ao processar." }); }
});

// Rota para reset final
app.post('/api/reset-senha-final', async (req, res) => {
    try {
        const { token, novaSenha } = req.body;
        const user = await Vendedor.findOne({
            resetToken: token,
            resetTokenExpires: { $gt: Date.now() }
        });
        if (!user) return res.status(400).json({ mensagem: "Link expirado." });
        user.senha = await bcrypt.hash(novaSenha, 10);
        user.resetToken = undefined;
        user.resetTokenExpires = undefined;
        await user.save();
        res.json({ mensagem: "Sucesso!" });
    } catch (err) { res.status(500).json({ mensagem: "Erro." }); }
});

// SERVIR O FRONTEND
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'Index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`>>> Servidor GARMOTOR ativo em: http://localhost:${PORT}`));