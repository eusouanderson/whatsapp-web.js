/**
 * ============================================================
 *  🗄️  TESTES — db.js
 *  Cobertura: normalizarNumero, CRUD, histórico, resumo
 * ============================================================
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_TEST = path.join(__dirname, '../fixtures/test-db.json');

// Aponta o banco para arquivo temporário de teste
process.env.WHATSAPP_DB_PATH = DB_TEST;

// Importa APÓS setar a env
const db = await import('../../db.js');

// ─── SETUP / TEARDOWN ────────────────────────────────────────
beforeEach(() => {
    if (fs.existsSync(DB_TEST)) fs.unlinkSync(DB_TEST);
});
afterEach(() => {
    if (fs.existsSync(DB_TEST)) fs.unlinkSync(DB_TEST);
});

// ════════════════════════════════════════════════════════════
//  ler() — recuperação de banco corrompido
// ════════════════════════════════════════════════════════════
describe('recuperação de banco corrompido', () => {
    it('retorna banco vazio quando arquivo JSON é inválido', () => {
        fs.writeFileSync(DB_TEST, 'CONTEÚDO INVÁLIDO {{{', 'utf-8');
        // Qualquer operação que chame ler() deve funcionar sem lançar erro
        const contatos = db.listarContatos();
        expect(contatos).toEqual([]);
    });

    it('retorna banco vazio quando arquivo não existe', () => {
        // beforeEach já remove o arquivo, então só verificamos o retorno padrão
        const resumoVazio = db.resumo();
        expect(resumoVazio.total_contatos).toBe(0);
    });
});

// ════════════════════════════════════════════════════════════
//  normalizarNumero
// ════════════════════════════════════════════════════════════
describe('normalizarNumero', () => {
    it('mantém número que já começa com 55', () => {
        expect(db.normalizarNumero('5511999998888')).toBe('5511999998888');
    });
    it('adiciona 55 em número com DDD de 11 dígitos', () => {
        expect(db.normalizarNumero('11999998888')).toBe('5511999998888');
    });
    it('adiciona 55 em número com DDD de 10 dígitos', () => {
        expect(db.normalizarNumero('1199998888')).toBe('551199998888');
    });
    it('remove caracteres não numéricos antes de normalizar', () => {
        expect(db.normalizarNumero('+55 (11) 9.9999-8888')).toBe(
            '5511999998888',
        );
    });
});

// ════════════════════════════════════════════════════════════
//  inserirContato
// ════════════════════════════════════════════════════════════
describe('inserirContato', () => {
    it('insere contato novo com sucesso', () => {
        const r = db.inserirContato('João Silva', '11991172734');
        expect(r.ok).toBe(true);
        expect(r.id).toBeGreaterThan(0);
        expect(r.duplicado).toBe(false);
    });

    it('retorna duplicado ao inserir mesmo número', () => {
        db.inserirContato('João Silva', '11991172734');
        const r2 = db.inserirContato('João Outro', '11991172734');
        expect(r2.ok).toBe(false);
        expect(r2.duplicado).toBe(true);
        expect(r2.msg).toContain('já cadastrado');
    });

    it('normaliza o número ao inserir', () => {
        db.inserirContato('Ana', '+55 11 99999-8888');
        const contatos = db.listarContatos();
        expect(contatos[0].numero).toBe('5511999998888');
    });

    it('salva campos extras (email, nota, aniversario)', () => {
        db.inserirContato('Maria', '11988887777', {
            email: 'maria@test.com',
            nota: 'VIP',
            aniversario: '15.03.1990',
        });
        const contatos = db.listarContatos();
        expect(contatos[0].email).toBe('maria@test.com');
        expect(contatos[0].nota).toBe('VIP');
        expect(contatos[0].aniversario).toBe('15.03.1990');
    });
});

// ════════════════════════════════════════════════════════════
//  listarContatos
// ════════════════════════════════════════════════════════════
describe('listarContatos', () => {
    it('retorna lista vazia quando não há contatos', () => {
        expect(db.listarContatos()).toEqual([]);
    });

    it('retorna contatos em ordem alfabética', () => {
        db.inserirContato('Zélia', '11900000001');
        db.inserirContato('Ana', '11900000002');
        db.inserirContato('Maria', '11900000003');
        const nomes = db.listarContatos().map((c) => c.nome);
        expect(nomes).toEqual(['Ana', 'Maria', 'Zélia']);
    });

    it('inclui estatísticas de envio no retorno', () => {
        const r = db.inserirContato('Carlos', '11900000001');
        db.registrarEnvio(r.id, 'Olá!', 'ok');
        db.registrarEnvio(r.id, 'Falhou', 'erro', 'timeout');
        const lista = db.listarContatos();
        expect(lista[0].total_envios).toBe(2);
        expect(lista[0].envios_ok).toBe(1);
    });
});

// ════════════════════════════════════════════════════════════
//  buscarPorNumero
// ════════════════════════════════════════════════════════════
describe('buscarPorNumero', () => {
    it('encontra contato pelo número normalizado', () => {
        db.inserirContato('Pedro', '11977776666');
        const c = db.buscarPorNumero('11977776666');
        expect(c).not.toBeNull();
        expect(c.nome).toBe('Pedro');
    });

    it('retorna null para número não cadastrado', () => {
        expect(db.buscarPorNumero('11900000000')).toBeNull();
    });

    it('normaliza o número na busca', () => {
        db.inserirContato('Lucas', '5511955554444');
        const c = db.buscarPorNumero('+55 11 9.5555-4444');
        expect(c).not.toBeNull();
    });
});

// ════════════════════════════════════════════════════════════
//  atualizarContato
// ════════════════════════════════════════════════════════════
describe('atualizarContato', () => {
    it('atualiza o nome do contato', () => {
        const r = db.inserirContato('Nome Antigo', '11900000001');
        db.atualizarContato(r.id, 'Nome Novo');
        const lista = db.listarContatos();
        expect(lista[0].nome).toBe('Nome Novo');
    });

    it('não afeta outros contatos ao atualizar', () => {
        const r1 = db.inserirContato('Alice', '11900000001');
        db.inserirContato('Bob', '11900000002');
        db.atualizarContato(r1.id, 'Alice Atualizada');
        const lista = db.listarContatos();
        const bob = lista.find((c) => c.numero === '5511900000002');
        expect(bob.nome).toBe('Bob');
    });

    it('não lança erro ao tentar atualizar contato inexistente (branch if c = false)', () => {
        // Contato id 9999 não existe → c = undefined → if (c) é false → sem salvar
        expect(() => db.atualizarContato(9999, 'Fantasma')).not.toThrow();
        expect(db.listarContatos()).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════
//  removerContato
// ════════════════════════════════════════════════════════════
describe('removerContato', () => {
    it('remove contato existente', () => {
        const r = db.inserirContato('Para Remover', '11900000001');
        db.removerContato(r.id);
        expect(db.listarContatos()).toHaveLength(0);
    });

    it('remove também o histórico do contato (cascade)', () => {
        const r = db.inserirContato('Com Histórico', '11900000001');
        db.registrarEnvio(r.id, 'msg', 'ok');
        db.removerContato(r.id);
        expect(db.historicoContato(r.id)).toHaveLength(0);
    });

    it('não afeta outros contatos ao remover', () => {
        const r1 = db.inserirContato('Remover', '11900000001');
        db.inserirContato('Manter', '11900000002');
        db.removerContato(r1.id);
        expect(db.listarContatos()).toHaveLength(1);
        expect(db.listarContatos()[0].nome).toBe('Manter');
    });
});

// ════════════════════════════════════════════════════════════
//  importarContatos
// ════════════════════════════════════════════════════════════
describe('importarContatos', () => {
    it('importa lista de contatos corretamente', () => {
        const lista = [
            { nome: 'A', numero: '11900000001' },
            { nome: 'B', numero: '11900000002' },
            { nome: 'C', numero: '11900000003' },
        ];
        const r = db.importarContatos(lista);
        expect(r.inseridos).toBe(3);
        expect(r.duplicados).toBe(0);
        expect(db.listarContatos()).toHaveLength(3);
    });

    it('ignora duplicatas na importação', () => {
        db.inserirContato('Existente', '11900000001');
        const lista = [
            { nome: 'Existente', numero: '11900000001' },
            { nome: 'Novo', numero: '11900000002' },
        ];
        const r = db.importarContatos(lista);
        expect(r.inseridos).toBe(1);
        expect(r.duplicados).toBe(1);
    });

    it('importa com campos extras (email, nota, aniversario)', () => {
        db.importarContatos([
            {
                nome: 'Teste',
                numero: '11900000001',
                email: 'teste@t.com',
                nota: 'obs',
                aniversario: '01.01.1990',
            },
        ]);
        const c = db.listarContatos()[0];
        expect(c.email).toBe('teste@t.com');
        expect(c.nota).toBe('obs');
        expect(c.aniversario).toBe('01.01.1990');
    });

    it('retorna zero inseridos para lista vazia', () => {
        const r = db.importarContatos([]);
        expect(r.inseridos).toBe(0);
        expect(r.duplicados).toBe(0);
    });
});

// ════════════════════════════════════════════════════════════
//  registrarEnvio / historicoContato
// ════════════════════════════════════════════════════════════
describe('registrarEnvio e historicoContato', () => {
    it('registra envio com status ok', () => {
        const r = db.inserirContato('Teste', '11900000001');
        db.registrarEnvio(r.id, 'Olá!', 'ok');
        const hist = db.historicoContato(r.id);
        expect(hist).toHaveLength(1);
        expect(hist[0].status).toBe('ok');
        expect(hist[0].mensagem).toBe('Olá!');
    });

    it('registra envio com status erro e motivo', () => {
        const r = db.inserirContato('Teste', '11900000001');
        db.registrarEnvio(r.id, 'msg', 'erro', 'Número inválido');
        const hist = db.historicoContato(r.id);
        expect(hist[0].status).toBe('erro');
        expect(hist[0].motivo).toBe('Número inválido');
    });

    it('retorna histórico em ordem decrescente', () => {
        const r = db.inserirContato('Teste', '11900000001');
        db.registrarEnvio(r.id, 'primeiro', 'ok');
        db.registrarEnvio(r.id, 'segundo', 'ok');
        db.registrarEnvio(r.id, 'terceiro', 'ok');
        const hist = db.historicoContato(r.id);
        expect(hist[0].mensagem).toBe('terceiro');
    });

    it('retorna lista vazia para contato sem histórico', () => {
        expect(db.historicoContato(999)).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════
//  resumo
// ════════════════════════════════════════════════════════════
describe('resumo', () => {
    it('retorna zeros quando banco está vazio', () => {
        const r = db.resumo();
        expect(r.total_contatos).toBe(0);
        expect(r.total_envios).toBe(0);
        expect(r.envios_ok).toBe(0);
        expect(r.envios_erro).toBe(0);
    });

    it('conta corretamente contatos e envios', () => {
        const r1 = db.inserirContato('A', '11900000001');
        const r2 = db.inserirContato('B', '11900000002');
        db.registrarEnvio(r1.id, 'msg', 'ok');
        db.registrarEnvio(r1.id, 'msg', 'ok');
        db.registrarEnvio(r2.id, 'msg', 'erro', 'falhou');

        const resumo = db.resumo();
        expect(resumo.total_contatos).toBe(2);
        expect(resumo.total_envios).toBe(3);
        expect(resumo.envios_ok).toBe(2);
        expect(resumo.envios_erro).toBe(1);
    });
});
