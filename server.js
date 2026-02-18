const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt'); 
const crypto = require('crypto'); 

const app = express();

// --- CONFIGURAÇÃO ---
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static(__dirname));

// --- CONEXÃO MONGODB ---
// Substitui <password> pela tua senha real do MongoDB Atlas
const mongoURI = 'mongodb+srv://tiagoalvessampaio12_db_user:rdeXqIxQXV7L64jC@garmotor.jrj7tav.mongodb.net/?appName=Garmotor'; 

mongoose.connect(mongoURI)
    .then(() => console.log('>>> Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// --- MODELOS (SCHEMAS) ---

const VendedorSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    senha: { type: String, required: true },
    tipo: { type: String, default: 'Cliente' },
    resetToken: String,
    resetTokenExpires: Date
});
const Vendedor = mongoose.model('Vendedor', VendedorSchema);

const VeiculoSchema = new mongoose.Schema({
    vendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendedor' },
    marca: String,
    modelo: String,
    ano: Number,
    kms: Number,
    combustivel: String,
    caixa: String,
    cor: String,
    preco: Number,
    descricao: String,
    imagemCapa: String, 
    estado: { type: String, default: 'Disponível' },
    dataPublicacao: { type: Date, default: Date.now }
});
const Veiculo = mongoose.model('Veiculo', VeiculoSchema);

// --- INICIALIZAÇÃO: Admin padrão ---
const inicializarAdmin = async () => {
    try {
        const adminExistente = await Vendedor.findOne({ email: 'tiagoalvessampaio12@gmail.com' });
        if (!adminExistente) {
            const hash = await bcrypt.hash('Garmotor2026!', 10);
            await Vendedor.create({
                nome: 'GARMOTOR',
                email: 'tiagoalvessampaio12@gmail.com',
                senha: hash,
                tipo: 'Admin'
            });
            console.log('>>> Admin GARMOTOR criado no MongoDB!');
        }
    } catch (err) { console.error('Erro ao criar admin:', err); }
};
inicializarAdmin();

// --- ROTAS ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Index.html')));

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, pass } = req.body;
        const user = await Vendedor.findOne({ email });
        if (user && await bcrypt.compare(pass, user.senha)) {
            res.json({ nome: user.nome, email: user.email, tipo: user.tipo });
        } else {
            res.status(401).json({ mensagem: "Email ou senha incorretos." });
        }
    } catch (err) { res.status(500).json({ mensagem: "Erro no servidor." }); }
});

// RECUPERAÇÃO DE SENHA (Gera o link para o Frontend)
app.post('/api/recuperar-senha', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await Vendedor.findOne({ email });
        if (!user) return res.status(404).json({ mensagem: "Email não registado." });

        const token = crypto.randomBytes(20).toString('hex');
        user.resetToken = token;
        user.resetTokenExpires = Date.now() + 3600000; 
        await user.save();

        // Como não usas Render, o link será baseado no teu endereço local ou novo domínio
        const domain = req.headers.host; 
        const link = `http://${domain}/ResetUser.html?token=${token}`;

        res.json({ link, email: user.email });
    } catch (err) { res.status(500).json({ mensagem: "Erro ao processar pedido." }); }
});

// RESET FINAL
app.post('/api/reset-senha-final', async (req, res) => {
    try {
        const { token, novaSenha } = req.body;
        const user = await Vendedor.findOne({
            resetToken: token,
            resetTokenExpires: { $gt: Date.now() }
        });
        if (!user) return res.status(400).json({ mensagem: "Link inválido ou expirado." });

        user.senha = await bcrypt.hash(novaSenha, 10);
        user.resetToken = undefined;
        user.resetTokenExpires = undefined;
        await user.save();
        res.json({ mensagem: "Password alterada com sucesso!" });
    } catch (err) { res.status(500).json({ mensagem: "Erro ao alterar password." }); }
});

// VEÍCULOS
app.get('/api/veiculos', async (req, res) => {
    const veiculos = await Veiculo.find().sort({ dataPublicacao: -1 });
    res.json(veiculos);
});

app.post('/api/veiculos/adicionar', async (req, res) => {
    const novoVeiculo = new Veiculo(req.body);
    await novoVeiculo.save();
    res.status(201).json(novoVeiculo);
});

app.delete('/api/veiculos/:id', async (req, res) => {
    await Veiculo.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor a correr em http://localhost:${PORT}`));