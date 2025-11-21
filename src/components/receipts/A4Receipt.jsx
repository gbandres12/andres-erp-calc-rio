
import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatBRL, formatDate, formatDateTime } from "@/components/utils/formatters";

export default function A4Receipt({ type, data, onPrint }) {
  const handlePrint = () => {
    window.print();
    if (onPrint) onPrint();
  };

  const renderSaleReceipt = () => {
    // Preparar dados de pagamento para a tabela
    const paymentRows = [];

    // Adicionar entrada inicial se existir
    if (data.paid_amount > 0 && (!data.installments || data.installments.length === 0)) {
      paymentRows.push({
        descricao: data.payment_method === 'dinheiro' ? 'Dinheiro' :
                   data.payment_method === 'pix' ? 'PIX' :
                   data.payment_method === 'cartao_credito' ? 'Cartão de Crédito' :
                   data.payment_method === 'cartao_debito' ? 'Cartão de Débito' :
                   data.payment_method || 'Pagamento',
        vencimento: formatDate(data.sale_date),
        pagamento: formatDate(data.sale_date),
        valor: data.paid_amount,
        saldo: data.remaining_amount || 0
      });
    }

    // Adicionar parcelas
    if (data.installments && data.installments.length > 0) {
      data.installments.forEach((inst, idx) => {
        paymentRows.push({
          descricao: `Parcela ${inst.installment_number}/${data.installments.length}`,
          vencimento: formatDate(inst.due_date),
          pagamento: inst.payment_date ? formatDate(inst.payment_date) : '-',
          valor: inst.amount,
          saldo: inst.status === 'pago' ? 0 : inst.amount - (inst.paid_amount || 0)
        });
      });
    }

    // Se não houver pagamentos registrados, mostrar o total como pendente
    if (paymentRows.length === 0 && data.total && data.total > 0) {
      paymentRows.push({
        descricao: 'A definir',
        vencimento: formatDate(data.sale_date),
        pagamento: '-',
        valor: data.total,
        saldo: data.total
      });
    }

    return (
      <div style={{
        width: '210mm',
        minHeight: '297mm',
        background: 'white',
        padding: '15mm',
        fontFamily: 'Arial, sans-serif',
        fontSize: '10pt',
        color: '#000',
        lineHeight: '1.4' // Updated line height
      }}>
        {/* CABEÇALHO */}
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '3px solid #1B3C73', paddingBottom: '15px' }}>
          <h1 style={{
            fontSize: '20pt',
            fontWeight: 'bold',
            color: '#1B3C73',
            margin: '0 0 8px 0'
          }}>
            {data.company_name || 'EMPRESA'}
          </h1>
          <div style={{ fontSize: '9pt', color: '#555', lineHeight: '1.6' }}>
            {data.company_cnpj && <div>CNPJ: {data.company_cnpj}</div>}
            {data.company_address && <div>{data.company_address}</div>}
            {(data.company_city || data.company_state) && (
              <div>{data.company_city}{data.company_city && data.company_state && ' - '}{data.company_state}</div>
            )}
            {data.company_phone && <div>Tel: {data.company_phone}</div>}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{
            fontSize: '18pt',
            fontWeight: 'bold',
            color: '#0B1E3C',
            margin: '0'
          }}>
            PEDIDO DE VENDA Nº {data.reference || ''}
          </h2>
        </div>

        {/* DADOS DO PEDIDO */}
        <div style={{ marginBottom: '16px', background: '#F9FAFB', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 10px 0',
            color: '#1B3C73',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '6px'
          }}>
            Dados do Pedido
          </h3>
          <table style={{ width: '100%', fontSize: '9pt' }}>
            <tbody>
              <tr>
                <td style={{ width: '33%', padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Cliente:</strong>
                  <div>{data.client_name || ''}</div>
                </td>
                <td style={{ width: '33%', padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>CPF/CNPJ:</strong>
                  <div>{data.client_document}</div>
                </td>
                <td style={{ width: '34%', padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Vendedor:</strong>
                  <div>{data.seller_name || 'N/A'}</div>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Data de Criação:</strong>
                  <div>{formatDate(data.created_date)}</div>
                </td>
                <td style={{ padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Data de Emissão:</strong>
                  <div>{formatDate(data.sale_date)}</div>
                </td>
                <td style={{ padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Data de Entrega:</strong>
                  <div>{data.delivery_date ? formatDate(data.delivery_date) : 'A combinar'}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ENDEREÇOS */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 10px 0',
            color: '#1B3C73',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '6px'
          }}>
            Endereços
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E0E0E0' }}>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '8px', color: '#0B1E3C' }}>
                Endereço de Cobrança
              </div>
              <div style={{ fontSize: '9pt', lineHeight: '1.6' }}>
                <div><strong>Endereço:</strong> {data.client_address || 'N/A'}</div>
                {data.client_number && <div><strong>Número:</strong> {data.client_number}</div>}
                {data.client_neighborhood && <div><strong>Bairro:</strong> {data.client_neighborhood}</div>}
                <div><strong>Cidade:</strong> {data.client_city || 'N/A'}</div>
                <div><strong>Estado:</strong> {data.client_state || 'N/A'}</div>
                <div><strong>CEP:</strong> {data.client_zip_code || 'N/A'}</div>
              </div>
            </div>
            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E0E0E0' }}>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '8px', color: '#0B1E3C' }}>
                Endereço de Entrega
              </div>
              <div style={{ fontSize: '9pt', lineHeight: '1.6' }}>
                <div><strong>Endereço:</strong> {data.client_address || 'N/A'}</div>
                {data.client_number && <div><strong>Número:</strong> {data.client_number}</div>}
                {data.client_neighborhood && <div><strong>Bairro:</strong> {data.client_neighborhood}</div>}
                <div><strong>Cidade:</strong> {data.client_city || 'N/A'}</div>
                <div><strong>Estado:</strong> {data.client_state || 'N/A'}</div>
                <div><strong>CEP:</strong> {data.client_zip_code || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ITENS DO PEDIDO */}
        <div style={{ marginBottom: '15px' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 8px 0',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '5px',
            color: '#1B3C73'
          }}>
            📦 Itens do Pedido
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'left', color: '#1B3C73', fontWeight: 'bold', width: '12%' }}>Referência</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'left', color: '#1B3C73', fontWeight: 'bold', width: '28%' }}>Descrição</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center', color: '#1B3C73', fontWeight: 'bold', width: '8%' }}>Un.</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center', color: '#1B3C73', fontWeight: 'bold', width: '12%' }}>Quantidade</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', color: '#1B3C73', fontWeight: 'bold', width: '15%' }}>Unitário</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', color: '#1B3C73', fontWeight: 'bold', width: '10%' }}>Desconto</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', color: '#1B3C73', fontWeight: 'bold', width: '15%' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items?.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px' }}>{item.product_code || '-'}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px' }}>{item.product_name}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right' }}>{formatBRL(item.unit_price)}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right' }}>{formatBRL(item.discount || 0)}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TOTAIS DO PEDIDO */}
        <div style={{ marginBottom: '15px', background: '#F0F4F8', padding: '12px', borderRadius: '6px', border: '2px solid #1B3C73' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <table style={{ width: '50%', fontSize: '9pt' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Total dos Itens:</strong></td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(data.subtotal || 0)}</td>
                </tr>
                {data.discount > 0 && (
                  <tr>
                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Desconto:</strong></td>
                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#DC2626', fontWeight: 'bold' }}>- {formatBRL(data.discount)}</td>
                  </tr>
                )}
                {data.shipping > 0 && (
                  <tr>
                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Frete:</strong></td>
                    <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(data.shipping)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Outros:</strong></td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(0)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #1B3C73' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11pt', color: '#0B1E3C' }}><strong>Valor Total:</strong></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12pt', fontWeight: 'bold', color: '#1B3C73' }}>{formatBRL(data.total || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FORMA / CONDIÇÕES DE PAGAMENTO */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 10px 0',
            color: '#1B3C73',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '6px'
          }}>
            Forma / Condições de Pagamento
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'left', color: '#0B1E3C', fontWeight: 'bold' }}>Descrição</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center', color: '#0B1E3C', fontWeight: 'bold' }}>Vencimento</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center', color: '#0B1E3C', fontWeight: 'bold' }}>Pagamento</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right', color: '#0B1E3C', fontWeight: 'bold' }}>Valor</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right', color: '#0B1E3C', fontWeight: 'bold' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px' }}>{row.descricao}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center' }}>{row.vencimento}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center' }}>{row.pagamento}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right' }}>{formatBRL(row.valor)}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right', fontWeight: 'bold', color: row.saldo > 0 ? '#DC2626' : '#059669' }}>
                    {formatBRL(row.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* OBSERVAÇÕES */}
        {data.notes && (
          <div style={{ marginBottom: '20px', background: '#FFFBEB', padding: '12px', borderRadius: '6px', border: '1px solid #FDE047' }}>
            <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '6px', color: '#854D0E' }}>
              Observações:
            </div>
            <div style={{ fontSize: '9pt', color: '#78350F', lineHeight: '1.6' }}>
              {data.notes}
            </div>
          </div>
        )}

        {/* LINHAS DE ASSINATURA */}
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '8px', marginTop: '50px', fontSize: '9pt', color: '#333' }}>
                <strong>Assinatura do Comprador</strong>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '8px', marginTop: '50px', fontSize: '9pt', color: '#333' }}>
                <strong>Assinatura do Recebedor</strong>
              </div>
            </div>
          </div>
        </div>

        {/* RODAPÉ */}
        <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '8pt', color: '#666', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
          <p style={{ margin: '0' }}>Este documento é uma via do pedido de venda e serve como comprovante da transação.</p>
          <p style={{ margin: '5px 0 0 0' }}>Emitido em {formatDate(new Date().toISOString())}</p>
        </div>
      </div>
    );
  };

  const renderPaymentReceipt = () => {
    const isReceita = data.type === 'receita';

    return (
      <div style={{
        width: '210mm',
        minHeight: '297mm',
        background: 'white',
        padding: '15mm',
        fontFamily: 'Arial, sans-serif',
        fontSize: '10pt',
        color: '#000'
      }}>
        {/* Cabeçalho */}
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
          <h1 style={{ fontSize: '18pt', fontWeight: 'bold', margin: '0 0 5px 0' }}>
            {isReceita ? 'RECIBO DE RECEBIMENTO' : 'COMPROVANTE DE PAGAMENTO'}
          </h1>
          <p style={{ fontSize: '10pt', margin: '0' }}>{data.company_name || 'EMPRESA'}</p>
        </div>

        {/* Informações */}
        <div style={{ marginBottom: '15px' }}>
          <p style={{ margin: '5px 0' }}><strong>Data:</strong> {formatDateTime(data.payment_date || data.created_date)}</p>
          <p style={{ margin: '5px 0' }}><strong>{isReceita ? 'Recebido de' : 'Pago para'}:</strong> {data.contact_name || 'N/A'}</p>
        </div>

        {/* Descrição */}
        <div style={{ marginBottom: '15px', border: '1px solid #ddd', padding: '10px', background: '#f9f9f9' }}>
          <p style={{ margin: '0 0 5px 0' }}><strong>Descrição:</strong></p>
          <p style={{ margin: '0' }}>{data.description || ''}</p>
          {data.category && (
            <p style={{ margin: '10px 0 0 0' }}><strong>Categoria:</strong> {data.category}</p>
          )}
        </div>

        {/* Valores */}
        <div style={{ border: '2px solid #000', padding: '10px', background: '#f0f0f0' }}>
          <table style={{ width: '100%', fontSize: '11pt' }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px', textAlign: 'right' }}><strong>Valor Total:</strong></td>
                <td style={{ padding: '5px', textAlign: 'right', width: '30%', fontSize: '14pt', fontWeight: 'bold' }}>
                  {formatBRL(data.amount)}
                </td>
              </tr>
              {data.paid_amount > 0 && data.paid_amount < data.amount && (
                <>
                  <tr>
                    <td style={{ padding: '5px', textAlign: 'right' }}>Valor Pago:</td>
                    <td style={{ padding: '5px', textAlign: 'right' }}>{formatBRL(data.paid_amount)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '5px', textAlign: 'right' }}>Saldo Restante:</td>
                    <td style={{ padding: '5px', textAlign: 'right', color: '#c62828', fontWeight: 'bold' }}>
                      {formatBRL(data.amount - data.paid_amount)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {data.account_name && (
          <p style={{ margin: '15px 0' }}><strong>Conta:</strong> {data.account_name}</p>
        )}

        {data.notes && (
          <div style={{ marginTop: '15px', border: '1px solid #ddd', padding: '10px' }}>
            <p style={{ margin: '0 0 5px 0' }}><strong>Observações:</strong></p>
            <p style={{ margin: '0' }}>{data.notes}</p>
          </div>
        )}

        {/* Assinatura */}
        <div style={{ marginTop: '60px', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', width: '60%', margin: '0 auto', paddingTop: '10px' }}>
            <strong>Assinatura</strong>
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '9pt' }}>
          <p style={{ fontWeight: 'bold' }}>
            {isReceita ? '✓ RECEBIMENTO EFETUADO COM SUCESSO' : '✓ PAGAMENTO EFETUADO COM SUCESSO'}
          </p>
        </div>
      </div>
    );
  };

  const renderBudgetReceipt = () => {
    // Preparar dados de pagamento para a tabela (similar ao sale, mas talvez com status diferente se for só orçamento)
    const paymentRows = [];

    // Adicionar parcelas
    if (data.installments && data.installments.length > 0) {
      data.installments.forEach((inst, idx) => {
        paymentRows.push({
          descricao: `Parcela ${inst.installment_number}/${data.installments.length}`,
          vencimento: formatDate(inst.due_date),
          pagamento: inst.payment_date ? formatDate(inst.payment_date) : '-', // Orçamento pode não ter pagamento
          valor: inst.amount,
          saldo: inst.status === 'pago' ? 0 : inst.amount - (inst.paid_amount || 0)
        });
      });
    }

    if (paymentRows.length === 0 && data.total && data.total > 0) {
      paymentRows.push({
        descricao: 'A definir',
        vencimento: formatDate(data.sale_date), // Usar data de emissão/criação do orçamento
        pagamento: '-',
        valor: data.total,
        saldo: data.total
      });
    }

    return (
      <div style={{
        width: '210mm',
        minHeight: '297mm',
        background: 'white',
        padding: '15mm',
        fontFamily: 'Arial, sans-serif',
        fontSize: '10pt',
        color: '#000',
        lineHeight: '1.4'
      }}>
        {/* CABEÇALHO */}
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '3px solid #1B3C73', paddingBottom: '15px' }}>
          <h1 style={{
            fontSize: '20pt',
            fontWeight: 'bold',
            color: '#1B3C73',
            margin: '0 0 8px 0'
          }}>
            {data.company_name || 'EMPRESA'}
          </h1>
          <div style={{ fontSize: '9pt', color: '#555', lineHeight: '1.6' }}>
            {data.company_cnpj && <div>CNPJ: {data.company_cnpj}</div>}
            {data.company_address && <div>{data.company_address}</div>}
            {(data.company_city || data.company_state) && (
              <div>{data.company_city}{data.company_city && data.company_state && ' - '}{data.company_state}</div>
            )}
            {data.company_phone && <div>Tel: {data.company_phone}</div>}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{
            fontSize: '18pt',
            fontWeight: 'bold',
            color: '#0B1E3C',
            margin: '0'
          }}>
            ORÇAMENTO Nº {data.reference || ''}
          </h2>
        </div>

        {/* DADOS DO ORÇAMENTO */}
        <div style={{ marginBottom: '16px', background: '#F9FAFB', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 10px 0',
            color: '#1B3C73',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '6px'
          }}>
            Dados do Orçamento
          </h3>
          <table style={{ width: '100%', fontSize: '9pt' }}>
            <tbody>
              <tr>
                <td style={{ width: '33%', padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Cliente:</strong>
                  <div>{data.client_name || ''}</div>
                </td>
                <td style={{ width: '33%', padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>CPF/CNPJ:</strong>
                  <div>{data.client_document}</div>
                </td>
                <td style={{ width: '34%', padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Vendedor:</strong>
                  <div>{data.seller_name || 'N/A'}</div>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Data de Criação:</strong>
                  <div>{formatDate(data.created_date)}</div>
                </td>
                <td style={{ padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Data de Emissão:</strong>
                  <div>{formatDate(data.sale_date)}</div>
                </td>
                <td style={{ padding: '4px 0' }}>
                  <strong style={{ color: '#0B1E3C' }}>Válido até:</strong>
                  <div>{data.valid_until ? formatDate(data.valid_until) : 'N/A'}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ENDEREÇOS */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 10px 0',
            color: '#1B3C73',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '6px'
          }}>
            Endereços
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E0E0E0' }}>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '8px', color: '#0B1E3C' }}>
                Endereço do Cliente
              </div>
              <div style={{ fontSize: '9pt', lineHeight: '1.6' }}>
                <div><strong>Endereço:</strong> {data.client_address || 'N/A'}</div>
                {data.client_number && <div><strong>Número:</strong> {data.client_number}</div>}
                {data.client_neighborhood && <div><strong>Bairro:</strong> {data.client_neighborhood}</div>}
                <div><strong>Cidade:</strong> {data.client_city || 'N/A'}</div>
                <div><strong>Estado:</strong> {data.client_state || 'N/A'}</div>
                <div><strong>CEP:</strong> {data.client_zip_code || 'N/A'}</div>
              </div>
            </div>
            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E0E0E0' }}>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '8px', color: '#0B1E3C' }}>
                Endereço de Entrega
              </div>
              <div style={{ fontSize: '9pt', lineHeight: '1.6' }}>
                <div><strong>Endereço:</strong> {data.delivery_address || data.client_address || 'N/A'}</div>
                {data.delivery_number && <div><strong>Número:</strong> {data.delivery_number}</div>}
                {data.delivery_neighborhood && <div><strong>Bairro:</strong> {data.delivery_neighborhood}</div>}
                <div><strong>Cidade:</strong> {data.delivery_city || data.client_city || 'N/A'}</div>
                <div><strong>Estado:</strong> {data.delivery_state || data.client_state || 'N/A'}</div>
                <div><strong>CEP:</strong> {data.delivery_zip_code || data.client_zip_code || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ITENS DO ORÇAMENTO */}
        <div style={{ marginBottom: '15px' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 8px 0',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '5px',
            color: '#1B3C73'
          }}>
            📦 Itens do Orçamento
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'left', color: '#1B3C73', fontWeight: 'bold', width: '12%' }}>Referência</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'left', color: '#1B3C73', fontWeight: 'bold', width: '28%' }}>Descrição</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center', color: '#1B3C73', fontWeight: 'bold', width: '8%' }}>Un.</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center', color: '#1B3C73', fontWeight: 'bold', width: '12%' }}>Quantidade</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', color: '#1B3C73', fontWeight: 'bold', width: '15%' }}>Unitário</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', color: '#1B3C73', fontWeight: 'bold', width: '10%' }}>Desconto</th>
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', color: '#1B3C73', fontWeight: 'bold', width: '15%' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items?.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px' }}>{item.product_code || '-'}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px' }}>{item.product_name}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right' }}>{formatBRL(item.unit_price)}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right' }}>{formatBRL(item.discount || 0)}</td>
                  <td style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TOTAIS DO ORÇAMENTO */}
        <div style={{ marginBottom: '15px', background: '#F0F4F8', padding: '12px', borderRadius: '6px', border: '2px solid #1B3C73' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <table style={{ width: '50%', fontSize: '9pt' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Total dos Itens:</strong></td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(data.subtotal || 0)}</td>
                </tr>
                {data.discount > 0 && (
                  <tr>
                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Desconto:</strong></td>
                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#DC2626', fontWeight: 'bold' }}>- {formatBRL(data.discount)}</td>
                  </tr>
                )}
                {data.shipping > 0 && (
                  <tr>
                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Frete:</strong></td>
                    <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(data.shipping)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#0B1E3C' }}><strong>Outros:</strong></td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(0)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #1B3C73' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11pt', color: '#0B1E3C' }}><strong>Valor Total:</strong></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12pt', fontWeight: 'bold', color: '#1B3C73' }}>{formatBRL(data.total || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FORMA / CONDIÇÕES DE PAGAMENTO */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{
            fontSize: '11pt',
            fontWeight: 'bold',
            margin: '0 0 10px 0',
            color: '#1B3C73',
            borderBottom: '2px solid #1B3C73',
            paddingBottom: '6px'
          }}>
            Forma / Condições de Pagamento
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'left', color: '#0B1E3C', fontWeight: 'bold' }}>Descrição</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center', color: '#0B1E3C', fontWeight: 'bold' }}>Vencimento</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center', color: '#0B1E3C', fontWeight: 'bold' }}>Pagamento</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right', color: '#0B1E3C', fontWeight: 'bold' }}>Valor</th>
                <th style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right', color: '#0B1E3C', fontWeight: 'bold' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px' }}>{row.descricao}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center' }}>{row.vencimento}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'center' }}>{row.pagamento}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right' }}>{formatBRL(row.valor)}</td>
                  <td style={{ border: '1px solid #E0E0E0', padding: '8px', textAlign: 'right', fontWeight: 'bold', color: row.saldo > 0 ? '#DC2626' : '#059669' }}>
                    {formatBRL(row.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* OBSERVAÇÕES */}
        {data.notes && (
          <div style={{ marginBottom: '20px', background: '#FFFBEB', padding: '12px', borderRadius: '6px', border: '1px solid #FDE047' }}>
            <div style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '6px', color: '#854D0E' }}>
              Observações:
            </div>
            <div style={{ fontSize: '9pt', color: '#78350F', lineHeight: '1.6' }}>
              {data.notes}
            </div>
          </div>
        )}

        {/* LINHAS DE ASSINATURA */}
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '8px', marginTop: '50px', fontSize: '9pt', color: '#333' }}>
                <strong>Assinatura do Cliente</strong>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '8px', marginTop: '50px', fontSize: '9pt', color: '#333' }}>
                <strong>Assinatura do Vendedor</strong>
              </div>
            </div>
          </div>
        </div>

        {/* RODAPÉ */}
        <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '8pt', color: '#666', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
          <p style={{ margin: '0' }}>Este documento é um orçamento e não constitui uma venda final.</p>
          <p style={{ margin: '5px 0 0 0' }}>Emitido em {formatDate(new Date().toISOString())}</p>
        </div>
      </div>
    );
  };


  const renderReceiptContent = () => {
    switch (type) {
      case 'sale':
        return renderSaleReceipt();
      case 'budget':
        return renderBudgetReceipt();
      case 'payment':
        return renderPaymentReceipt();
      default:
        return <p>Tipo de recibo não especificado ou não suportado.</p>;
    }
  };

  const getButtonText = () => {
    switch (type) {
      case 'sale':
        return 'Pedido de Venda';
      case 'budget':
        return 'Orçamento';
      case 'payment':
        return 'Recibo';
      default:
        return 'Documento';
    }
  };

  return (
    <>
      <div className="no-print" style={{ marginBottom: '20px' }}>
        <Button onClick={handlePrint} className="w-full">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir {getButtonText()}
        </Button>
      </div>

      {renderReceiptContent()}

      <style jsx>{`
        @media print {
          .no-print {
            display: none !important;
          }

          body {
            margin: 0;
            padding: 0;
          }

          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}
