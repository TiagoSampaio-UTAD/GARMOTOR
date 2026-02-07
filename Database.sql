/* BASE DE DADOS GARMOTOR 2026 - VERSÃO UTILIZADORES vs ADMIN
   - Sem Nome da Loja
   - Com distinção de permissões (Tipo)
*/

-- 1. CONFIGURAÇÃO INICIAL
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'GARMOTOR')
BEGIN
    CREATE DATABASE GARMOTOR;
END
GO

USE GARMOTOR;
GO

-- 2. LIMPEZA TOTAL (RESET)
-- Apagamos as tabelas para limpar todos os registos antigos e IDs
IF OBJECT_ID('dbo.Veiculos', 'U') IS NOT NULL DROP TABLE dbo.Veiculos;
IF OBJECT_ID('dbo.Vendedores', 'U') IS NOT NULL DROP TABLE dbo.Vendedores;
GO

-- 3. TABELA DE UTILIZADORES (Vendedores e Clientes)
CREATE TABLE Vendedores (
    Id INT PRIMARY KEY IDENTITY(1,1),
    Nome NVARCHAR(100) NOT NULL,
    Email NVARCHAR(100) UNIQUE NOT NULL,
    Senha NVARCHAR(255) NOT NULL,
    Tipo NVARCHAR(20) DEFAULT 'Cliente', -- 'Admin' (pode postar) ou 'Cliente' (favoritos)
    EmailConfirmado BIT DEFAULT 0,
    DataCriacao DATETIME DEFAULT GETDATE()
);
GO

-- 4. TABELA DE VEÍCULOS
CREATE TABLE Veiculos (
    Id INT PRIMARY KEY IDENTITY(1,1),
    VendedorId INT NOT NULL,
    Marca NVARCHAR(50),
    Modelo NVARCHAR(50),
    Ano INT,
    Kms INT,
    Combustivel NVARCHAR(30),
    Caixa NVARCHAR(30),
    Cor NVARCHAR(30),
    Preco DECIMAL(10, 2),
    Descricao NVARCHAR(MAX),
    ImagemCapa NVARCHAR(MAX), 
    DataPublicacao DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_VendedorVeiculo FOREIGN KEY (VendedorId) REFERENCES Vendedores(Id) ON DELETE CASCADE
);
GO

-- 5. INSERIR CONTA ADMIN OFICIAL (GARMOTOR)
-- Aqui usamos o teu email. Nome será sempre GARMOTOR para este email.
-- O Tipo 'Admin' garante que vês o botão de adicionar veículos.
INSERT INTO Vendedores (Nome, Email, Senha, Tipo, EmailConfirmado) 
VALUES 
('GARMOTOR', 'tiagoalvessampaio12@gmail.com', 'Garmotor2026!', 'Admin', 1);
GO

SELECT * FROM Vendedores;
SELECT * FROM Veiculos;