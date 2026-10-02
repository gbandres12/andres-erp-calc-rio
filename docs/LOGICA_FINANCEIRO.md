# Lógica do Módulo Financeiro — Andres ERP Calcário

> Documento para revisão técnica por outro modelo/analista. Descreve **como o financeiro funciona hoje** (estado real do código), as regras de negócio, os fluxos que gravam dados e os **problemas conhecidos**. Ao final há perguntas-guia para a análise.

Stack: React (frontend) + Base44 (BaaS: entidades com RLS, backend functions em Deno). Toda gravação financeira hoje acontece **no frontend**, em várias chamadas sequenciais ao SDK (sem transação atômica), exceto exclusões protegidas e recálculo de saldo, que rodam em backend functions.

---

## 1. Multi-filial e permissões

- Cada registro tem `company_id` (filial). O usuário escolhe a filial ativa (`localStorage.selectedCompanyId`) e todas as telas filtram por ela.
- RLS: leitura/criação/edição permitidas se `company_id ∈ user.allowed_companies` ou se `role = admin`. Exclusão: só admin (`role` ou `custom_role = admin`).
- Exclusões sensíveis passam pela função `deleteProtectedRecord`, que exige a **senha de exclusão de 5 dígitos da filial** (entidade `DeletionPassword`, hash + salt).

---

## 2. Entidades financeiras

| Entidade | Papel |
|---|---|
| `FinancialAccount` | Conta (banco, caixa, carteira digital). `initial_balance` + `current_balance` (este é **calculado**, cache). |
| `Transaction` | Lançamento (conta a pagar/receber). `type`: `receita` (Entrada) / `despesa` (Saída). Status: `pendente`, `parcial`, `pago`, `atrasado`. |
| `TransactionPayment` | Cada pagamento/recebimento/abatimento de um `Transaction`, com conta, valor, `discount`, data. **Fonte da verdade do caixa.** |
| `Sale` | Venda: `total`, `paid_amount`, `remaining_amount`, `discount` (abatimentos acumulados), `payment_status`. |
| `SalePayment` | Pagamento registrado na venda (espelho comercial do pagamento). |
| `SaleInstallment` | Parcelas da venda (`amount`, `paid_amount`, `status`, `due_date`). |
| `PurchaseOrderPayment` | Pagamentos de pedidos de compra. |
| `RecurringTransaction` | Modelo de lançamento recorrente (frequência, próximo vencimento). |
| `Barter` | Permuta calcário × milho (controle separado, não movimenta caixa). |

### Campos de valor do `Transaction`
- `amount`: valor líquido do título.
- `original_amount`, `discount_type`, `discount_value`: desconto aplicado na criação.
- `paid_amount`: soma do que já foi pago (cache).
- `discount`: soma dos abatimentos concedidos nos pagamentos (cache).
- **Saldo em aberto = `amount − paid_amount − discount`.**
- `account_id`: conta do último pagamento (é **sobrescrito** a cada pagamento — por isso não serve para saldo).

---

## 3. Saldo das contas (`recalculateBalance`)

Backend function, chamada após quase toda operação financeira com `{ company_id }` (opcional `account_id`).

Algoritmo:
1. Carrega todas as `Transaction` e `TransactionPayment` da filial (limite 10.000 cada).
2. Para cada `TransactionPayment`: soma `amount` na conta do pagamento como receita ou despesa (tipo vem da transação pai).
3. **Fallback legado:** transações sem nenhum `TransactionPayment` contam `paid_amount` (ou `amount` se `status = pago`) na `account_id` da própria transação.
4. `current_balance = initial_balance + receitas − despesas`; grava só se mudou.
5. Lock em memória por filial para serializar chamadas concorrentes (só vale dentro da mesma instância da função).

Observações:
- Abatimento (`discount`) **não** movimenta caixa — correto.
- Transferências entre contas financeiras **não existem** como entidade própria (a tela `Transfers` é de estoque entre filiais).
- O frontend muitas vezes chama o recálculo sem `await` (fire-and-forget), então a tela pode mostrar saldo antigo.

---

## 4. Fluxos que gravam dados

### 4.1 Lançamento manual (Transações / Contas a Pagar / Contas a Receber)
- Criação: `Transaction` com status derivado de `amount` × `remaining_amount` informados (Receivables calcula `paid = total − remaining`).
  - ⚠️ Se criado já `pago`/`parcial` desta forma, **não cria `TransactionPayment`** → cai no fallback legado do saldo.
- Sugestões por IA de categoria e centro de custo no formulário.

### 4.2 Receber / Pagar um título (`Receivables.receiveMutation`, `Payables.payMutation`, `Transactions`)
Sequência (no frontend):
1. Valida: valor ou abatimento > 0; conta obrigatória se houver valor; `valor + abatimento ≤ saldo em aberto`.
2. Cria `TransactionPayment` (amount, discount, conta, forma, responsável).
3. Atualiza `Transaction`: `paid_amount += valor`, `discount += abatimento`, status `pago` se saldo ≤ 0,005 senão `parcial`, `payment_date` se quitado, `account_id` = última conta.
4. Se a descrição contém **"Saldo a Receber"**, espelha na venda (`mirrorReceivingToSale`).
5. Em erro: rollback manual (apaga o payment, restaura a transação). Rollback **não desfaz** o espelho na venda.
6. Chama `recalculateBalance`.

### 4.3 Venda — faturamento (`Sales.jsx`)
1. Valida que entrada + pagamentos ≤ total.
2. Para cada pagamento: `createPaidTransaction` (cria `Transaction` `pago` + `TransactionPayment`, tag `| sale_id:<id>` em `notes`) e `SalePayment`.
3. Se sobrar saldo: cria `Transaction` pendente **"VENDA-xxxxx - Saldo a Receber - Cliente"** com `sale_id` em `notes`.
4. Atualiza `Sale` (`paid_amount`, `remaining_amount`, `payment_status`).
5. `reconcileSaleInstallments`: quita parcelas na ordem até esgotar `total − remaining`.
6. `recalculateBalance`.

### 4.4 Venda — pagamento posterior (`SalePaymentDialog`)
Permite vários pagamentos de uma vez, cada um com **abatimento**.
1. Para cada linha: cria `SalePayment` + `createPaidTransaction` (nova `Transaction` paga de `amount`, `original_amount = amount + discount`).
2. `Sale`: `paid_amount += total`, `discount += abatimentos`, `remaining = total − paid − discount`, status `concluida` se quitada.
3. Reconcilia parcelas e recalcula saldo.
- ⚠️ **Não abate o título "Saldo a Receber"** que foi criado no faturamento. Resultado: a venda fica quitada, mas o Contas a Receber continua mostrando o saldo pendente (duplicidade de recebível).

### 4.5 Espelho Contas a Receber → Venda (`mirrorReceivingToSale`)
- Encontra a venda pela tag `sale_id:` em `notes`; senão pela referência `VENDA-\d+` (somente se única na filial — há 29 referências duplicadas entre filiais).
- Cria `SalePayment` com `min(valor, saldo da venda)`, atualiza `paid_amount`, `discount`, `remaining_amount`, status e parcelas.

### 4.6 Pedido de compra (`purchaseOrders/PaymentDialog`)
- Cria `PurchaseOrderPayment` + `Transaction` de despesa e chama o recálculo. (Verificar se cria `TransactionPayment`; se não, depende do fallback legado.)

### 4.7 Recorrências (`generateRecurringTransactions`, workflow agendado)
- Para cada `RecurringTransaction` ativa com `next_due_date ≤ hoje`: cria `Transaction` pendente com `due_date = hoje` (não a data prevista) e avança `next_due_date` a partir de **hoje** (não da data anterior) → atrasos deslocam o calendário; `day_of_month` não é respeitado; meses curtos (31 → fev) rolam pelo `setMonth`.
- Roda com service role para todas as filiais; não há proteção contra geração duplicada se rodar duas vezes no mesmo dia antes de gravar.

### 4.8 Exclusões (`deleteProtectedRecord`, senha da filial)
- `transaction`: apaga os `TransactionPayment` e a transação.
- `transaction_payment`: apaga o pagamento e recompõe `paid_amount`/`discount`/status da transação a partir dos pagamentos restantes.
- `sale_payment`: apaga o `SalePayment`, tenta achar a `Transaction` correspondente por **proximidade de valor/data** (heurística), recompõe a venda e as parcelas.
- `sale`: apaga venda e lançamentos marcados com `sale_id`.
- Ao final chama `recalculateBalance`.

### 4.9 Edição de transação para "pendente"
- Ao reverter para pendente, os `TransactionPayment` vinculados são removidos (`deleteLinkedPayments`) e `paid_amount` zera.

---

## 5. Relatórios

- **Relatório Diário (`DailyFinancialReport`)**: por data, busca `TransactionPayment` do dia (fonte principal) + transações legadas sem payment; agrupa Entradas, Saídas e Abatimentos; mostra saldos por conta (usando `current_balance` atual, não o saldo histórico daquele dia). Exporta PDF/print.
- **Centro de Custo (`CostCenterReport`)**: agrupa por `cost_center` (muitos históricos vazios).
- **Relatórios gerais / Dashboard**: carregam listas grandes e somam no frontend.
- **Telegram**: relatório de saldos às 07:50 e 18:00 (`sendScheduledBalanceReport`) incluindo movimentação do dia anterior; alertas de vencimento (`checkFinancialAlerts`); bot financeiro (agente) com acesso a Transaction/Sale.

---

## 6. Regras de negócio resumidas

1. Caixa só se move por `TransactionPayment.amount` (ou fallback legado).
2. Abatimento reduz o saldo devedor, nunca o caixa.
3. Saldo do título = `amount − paid_amount − discount`; tolerância de arredondamento 0,005–0,01.
4. Venda quitada quando `total − paid − discount ≤ 0,01` → `status = concluida`.
5. Parcelas são quitadas sequencialmente pelo total pago (não por pagamento específico).
6. Datas de pagamento padrão = hoje (fuso America/Santarem; datas gravadas como `YYYY-MM-DD`).
7. Valores em CSV aceitam vírgula ou ponto como decimal.

---

## 7. Problemas conhecidos (observados em produção)

- Pagamentos às vezes ausentes nos relatórios; abatimentos com data divergente no relatório diário.
- Saldo de conta inconsistente por recálculo assíncrono/concorrente.
- Transações com valor zero ("fantasmas") e pagamentos sem conta vinculada.
- Duplicidade de recebível: pagamento via venda não baixa o "Saldo a Receber".
- 29 referências de venda duplicadas entre filiais (quebra o vínculo por referência).
- Lançamentos históricos sem `cost_center`.
- Lentidão: telas carregam milhares de registros e calculam totais no navegador.
- Bot do Telegram (`pay_bill`) ainda não cria `TransactionPayment`.
- Prospect não vira cliente automaticamente na primeira venda.

---

## 8. Pontos para a análise (perguntas-guia)

1. **Atomicidade**: mover cada fluxo (receber, pagar, pagamento de venda, faturamento) para uma única backend function com validação no servidor e rollback consistente?
2. **Uma única fonte da verdade**: eliminar caches (`paid_amount`, `discount`, `remaining_amount`, `current_balance`) ou recalculá-los sempre a partir de `TransactionPayment`/`SalePayment`? Unificar `SalePayment` e `TransactionPayment`?
3. **Vínculo venda ↔ título**: trocar a tag em `notes` e o match por texto ("Saldo a Receber", `VENDA-\d+`) por um campo `sale_id` real na `Transaction`.
4. **Pagamento de venda** deve baixar o título "Saldo a Receber" existente em vez de criar nova transação paga.
5. **Saldo**: recálculo incremental vs. total; lock distribuído; agregações no servidor (`aggregate`) em vez de carregar 10.000 registros.
6. **Migração do legado**: gerar `TransactionPayment` para todas as transações pagas antigas e remover o fallback.
7. **Recorrências**: respeitar `day_of_month`, calcular a partir do vencimento anterior, idempotência.
8. **Transferência entre contas financeiras** (caixa → banco) como operação própria.
9. **Relatório diário**: calcular saldo histórico do dia (saldo de abertura/fechamento) em vez de usar o saldo atual.
10. **Auditoria**: registrar quem/quando alterou valores (log de eventos financeiros, como já existe no fiscal com `FiscalEvent`).
11. **Arredondamento**: trabalhar em centavos (inteiros) para evitar erros de ponto flutuante.