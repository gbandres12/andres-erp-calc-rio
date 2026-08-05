import React from "react";
import { Button } from "@/components/ui/button";
import { Printer, Calendar } from "lucide-react";
import { formatBRL, formatDate, formatDateTime } from "@/components/utils/formatters";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68ea91a66a9614db4a82043d/0e678bbed_CALCARIOAMAZONIALOGO.png";
const GREEN = "#1a5e35";
const GREEN_DARK = "#134228";
const RED = "#cc0000";
const GREY_BG = "#f4f4f4";

function SectionHeader({ title }) {
  return (
    <div style={{
      background: GREEN,
      color: "#fff",
      padding: "6px 10px",
      fontWeight: "bold",
      fontSize: "10pt",
      letterSpacing: "0.3px",
      marginBottom: "6px"
    }}>
      {title}
    </div>
  );
}

export default function A4Receipt({ type, data, onPrint }) {
  const handlePrint = () => {
    window.print();
    if (onPrint) onPrint();
  };

  const renderSaleReceipt = () => {
    const paymentRows = [];

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

    if (data.installments && data.installments.length > 0) {
      data.installments.forEach((inst) => {
        paymentRows.push({
          descricao: `Parcela ${inst.installment_number}/${data.installments.length}`,
          vencimento: formatDate(inst.due_date),
          pagamento: inst.payment_date ? formatDate(inst.payment_date) : '-',
          valor: inst.amount,
          saldo: inst.status === 'pago' ? 0 : inst.amount - (inst.paid_amount || 0)
        });
      });
    }

    if (paymentRows.length === 0 && data.total && data.total > 0) {
      paymentRows.push({
        descricao: 'Parcela 1/1',
        vencimento: formatDate(data.sale_date),
        pagamento: '-',
        valor: data.total,
        saldo: data.total
      });
    }

    return (
      <div className="print-receipt" style={{
        width: '210mm',
        height: '297mm',
        background: '#fff',
        padding: '8mm 10mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9pt',
        color: '#000',
        lineHeight: '1.25',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}>
        {/* MARCA D'ÁGUA */}
        <img src={LOGO_URL} alt="" style={{
          position: 'absolute',
          bottom: '8mm',
          right: '8mm',
          width: '70mm',
          opacity: 0.06,
          pointerEvents: 'none',
          zIndex: 0
        }} />

        {/* CABEÇALHO */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px', paddingBottom: '8px', borderBottom: `2px solid ${GREEN}`, position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
            <img src={LOGO_URL} alt="Logo" style={{ maxHeight: '22mm', maxWidth: '30mm', objectFit: 'contain' }} />
          </div>
          {/* Empresa centro */}
          <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '13pt', fontWeight: 'bold', color: GREEN, letterSpacing: '0.5px' }}>
              {data.company_name || 'CBA SANTARÉM'}
            </div>
            {data.company_cnpj && <div style={{ fontSize: '8.5pt', color: '#333' }}>CNPJ: {data.company_cnpj}</div>}
            {data.company_address && <div style={{ fontSize: '8.5pt', color: '#333' }}>{data.company_address}</div>}
            <div style={{ fontSize: '8.5pt', color: '#333' }}>
              {data.company_city && `${data.company_city}`}{data.company_city && data.company_state && ' - '}{data.company_state}
            </div>
            {data.company_phone && <div style={{ fontSize: '8.5pt', color: '#333' }}>Tel: {data.company_phone}</div>}
          </div>
          {/* Caixa verde direita */}
          <div style={{ flex: '0 0 auto', minWidth: '52mm' }}>
            <div style={{
              background: GREEN,
              color: '#fff',
              padding: '8px 10px',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '11pt', fontWeight: 'bold', letterSpacing: '0.5px' }}>PEDIDO DE VENDA</div>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginTop: '2px' }}>N° {data.reference || ''}</div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              marginTop: '6px',
              fontSize: '8.5pt',
              color: '#333'
            }}>
              <Calendar size={12} color={GREEN} style={{ flexShrink: 0 }} />
              <span><strong>Data de Emissão:</strong> {formatDate(data.sale_date)}</span>
            </div>
          </div>
        </div>

        {/* DADOS DO PEDIDO */}
        <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
          <SectionHeader title="Dados do Pedido" />
          <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 8px 4px 0', width: '50%', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Cliente</div>
                  <div>{data.client_name || ''}</div>
                </td>
                <td style={{ padding: '4px 0 4px 8px', width: '50%', verticalAlign: 'top', borderLeft: '1px solid #ddd' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>CPF/CNPJ</div>
                  <div>{data.client_document || '-'}</div>
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px 4px 0', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Vendedor</div>
                  <div>{data.seller_name || 'N/A'}</div>
                </td>
                <td style={{ padding: '4px 0 4px 8px', verticalAlign: 'top', borderLeft: '1px solid #ddd' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Data de Criação</div>
                  <div>{formatDate(data.created_date)}</div>
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px 4px 0', verticalAlign: 'top' }} colSpan={2}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Data de Entrega</div>
                  <div>{data.delivery_date ? formatDate(data.delivery_date) : 'A combinar'}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ITENS DO PEDIDO */}
        <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
          <SectionHeader title="Itens do Pedido" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
            <thead>
              <tr style={{ background: GREEN, color: '#fff' }}>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'left', width: '10%' }}>Referência</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'left' }}>Descrição</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '6%' }}>Un.</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '11%' }}>Quantidade</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '13%' }}>Unitário</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '10%' }}>Desconto</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '14%' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items?.map((item, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : GREY_BG }}>
                  <td style={{ border: '1px solid #ddd', padding: '5px' }}>{item.product_code || '-'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px' }}>{item.product_name}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right' }}>{formatBRL(item.unit_price)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right' }}>{formatBRL(item.discount || 0)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* TOTAIS */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <table style={{ width: '55%', fontSize: '9pt', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 10px', textAlign: 'right', background: GREY_BG, border: '1px solid #ddd' }}><strong>Total dos Itens</strong></td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', background: GREY_BG, border: '1px solid #ddd', fontWeight: 'bold' }}>{formatBRL(data.subtotal || 0)}</td>
                </tr>
                {data.discount > 0 && (
                  <tr>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd' }}><strong>Desconto</strong></td>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd', color: RED, fontWeight: 'bold' }}>- {formatBRL(data.discount)}</td>
                  </tr>
                )}
                {data.shipping > 0 && (
                  <tr>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd' }}><strong>Frete</strong></td>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{formatBRL(data.shipping)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd' }}><strong>Outros</strong></td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{formatBRL(0)}</td>
                </tr>
                <tr style={{ background: GREEN, color: '#fff' }}>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10pt', border: `1px solid ${GREEN}` }}><strong>VALOR TOTAL</strong></td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11pt', fontWeight: 'bold', border: `1px solid ${GREEN}` }}>{formatBRL(data.total || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FORMA / CONDIÇÕES DE PAGAMENTO */}
        <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
          <SectionHeader title="Forma / Condições de Pagamento" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
            <thead>
              <tr style={{ background: GREEN, color: '#fff' }}>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'left' }}>Descrição</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '15%' }}>Vencimento</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '15%' }}>Pagamento</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '15%' }}>Valor</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '15%' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((row, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : GREY_BG }}>
                  <td style={{ border: '1px solid #ddd', padding: '5px' }}>{row.descricao}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{row.vencimento}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{row.pagamento}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right' }}>{formatBRL(row.valor)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right', fontWeight: 'bold', color: row.saldo > 0 ? RED : GREEN }}>
                    {formatBRL(row.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* OBSERVAÇÕES */}
        {data.notes && (
          <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
            <SectionHeader title="Observações" />
            <div style={{
              border: '1px solid #ddd',
              padding: '6px 8px',
              minHeight: '14mm',
              fontSize: '8.5pt',
              whiteSpace: 'pre-wrap',
              color: '#333'
            }}>
              {data.notes}
            </div>
          </div>
        )}

        {/* ASSINATURAS */}
        <div style={{ marginTop: '16mm', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: '20mm' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt', color: '#333' }}>
                <strong>Assinatura do Comprador</strong>
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt', color: '#333' }}>
                <strong>Assinatura do Recebedor</strong>
              </div>
            </div>
          </div>
        </div>

        {/* RODAPÉ */}
        <div style={{
          position: 'absolute',
          bottom: '4mm',
          left: '10mm',
          right: '10mm',
          textAlign: 'center',
          zIndex: 1
        }}>
          <div style={{ background: GREEN, color: '#fff', padding: '5px', fontSize: '8.5pt', fontWeight: 'bold', letterSpacing: '0.5px', borderRadius: '3px' }}>
            SUSTENTABILIDADE QUE GERA PRODUTIVIDADE.
          </div>
          <div style={{ fontSize: '7.5pt', color: '#666', marginTop: '3px' }}>
            Este documento é uma via do pedido de venda e serve como comprovante da transação.
          </div>
          <div style={{ fontSize: '7.5pt', color: '#666' }}>
            Emitido em {formatDate(new Date().toISOString())}
          </div>
        </div>
      </div>
    );
  };

  const renderPaymentReceipt = () => {
    const isReceita = data.type === 'receita';

    return (
      <div className="print-receipt" style={{
        width: '210mm',
        height: '297mm',
        background: 'white',
        padding: '15mm',
        fontFamily: 'Arial, sans-serif',
        fontSize: '10pt',
        color: '#000',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: `2px solid ${GREEN}`, paddingBottom: '10px' }}>
          <h1 style={{ fontSize: '18pt', fontWeight: 'bold', margin: '0 0 5px 0', color: GREEN }}>
            {isReceita ? 'RECIBO DE RECEBIMENTO' : 'COMPROVANTE DE PAGAMENTO'}
          </h1>
          <p style={{ fontSize: '10pt', margin: '0' }}>{data.company_name || 'EMPRESA'}</p>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <p style={{ margin: '5px 0' }}><strong>Data:</strong> {formatDateTime(data.payment_date || data.created_date)}</p>
          <p style={{ margin: '5px 0' }}><strong>{isReceita ? 'Recebido de' : 'Pago para'}:</strong> {data.contact_name || 'N/A'}</p>
        </div>

        <div style={{ marginBottom: '15px', border: '1px solid #ddd', padding: '10px', background: GREY_BG }}>
          <p style={{ margin: '0 0 5px 0' }}><strong>Descrição:</strong></p>
          <p style={{ margin: '0' }}>{data.description || ''}</p>
          {data.category && (
            <p style={{ margin: '10px 0 0 0' }}><strong>Categoria:</strong> {data.category}</p>
          )}
        </div>

        <div style={{ border: `2px solid ${GREEN}`, padding: '10px', background: GREY_BG }}>
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
                    <td style={{ padding: '5px', textAlign: 'right', color: RED, fontWeight: 'bold' }}>
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

        <div style={{ marginTop: '60px', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', width: '60%', margin: '0 auto', paddingTop: '10px' }}>
            <strong>Assinatura</strong>
          </div>
        </div>

        <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '9pt' }}>
          <p style={{ fontWeight: 'bold', color: GREEN }}>
            {isReceita ? '✓ RECEBIMENTO EFETUADO COM SUCESSO' : '✓ PAGAMENTO EFETUADO COM SUCESSO'}
          </p>
        </div>
      </div>
    );
  };

  const renderBudgetReceipt = () => {
    const paymentRows = [];

    if (data.installments && data.installments.length > 0) {
      data.installments.forEach((inst) => {
        paymentRows.push({
          descricao: `Parcela ${inst.installment_number}/${data.installments.length}`,
          vencimento: formatDate(inst.due_date),
          pagamento: inst.payment_date ? formatDate(inst.payment_date) : '-',
          valor: inst.amount,
          saldo: inst.status === 'pago' ? 0 : inst.amount - (inst.paid_amount || 0)
        });
      });
    }

    if (paymentRows.length === 0 && data.total && data.total > 0) {
      paymentRows.push({
        descricao: 'Parcela 1/1',
        vencimento: formatDate(data.sale_date),
        pagamento: '-',
        valor: data.total,
        saldo: data.total
      });
    }

    return (
      <div className="print-receipt" style={{
        width: '210mm',
        height: '297mm',
        background: '#fff',
        padding: '8mm 10mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9pt',
        color: '#000',
        lineHeight: '1.25',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}>
        <img src={LOGO_URL} alt="" style={{
          position: 'absolute', bottom: '8mm', right: '8mm', width: '70mm', opacity: 0.06, pointerEvents: 'none', zIndex: 0
        }} />

        {/* CABEÇALHO */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px', paddingBottom: '8px', borderBottom: `2px solid ${GREEN}`, position: 'relative', zIndex: 1 }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
            <img src={LOGO_URL} alt="Logo" style={{ maxHeight: '22mm', maxWidth: '30mm', objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '13pt', fontWeight: 'bold', color: GREEN, letterSpacing: '0.5px' }}>
              {data.company_name || 'CBA SANTARÉM'}
            </div>
            {data.company_cnpj && <div style={{ fontSize: '8.5pt', color: '#333' }}>CNPJ: {data.company_cnpj}</div>}
            {data.company_address && <div style={{ fontSize: '8.5pt', color: '#333' }}>{data.company_address}</div>}
            <div style={{ fontSize: '8.5pt', color: '#333' }}>
              {data.company_city && `${data.company_city}`}{data.company_city && data.company_state && ' - '}{data.company_state}
            </div>
            {data.company_phone && <div style={{ fontSize: '8.5pt', color: '#333' }}>Tel: {data.company_phone}</div>}
          </div>
          <div style={{ flex: '0 0 auto', minWidth: '52mm' }}>
            <div style={{ background: GREEN, color: '#fff', padding: '8px 10px', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '11pt', fontWeight: 'bold', letterSpacing: '0.5px' }}>ORÇAMENTO</div>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginTop: '2px' }}>N° {data.reference || ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginTop: '6px', fontSize: '8.5pt', color: '#333' }}>
              <Calendar size={12} color={GREEN} style={{ flexShrink: 0 }} />
              <span><strong>Data de Emissão:</strong> {formatDate(data.sale_date)}</span>
            </div>
          </div>
        </div>

        {/* DADOS DO ORÇAMENTO */}
        <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
          <SectionHeader title="Dados do Orçamento" />
          <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 8px 4px 0', width: '50%', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Cliente</div>
                  <div>{data.client_name || ''}</div>
                </td>
                <td style={{ padding: '4px 0 4px 8px', width: '50%', verticalAlign: 'top', borderLeft: '1px solid #ddd' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>CPF/CNPJ</div>
                  <div>{data.client_document || '-'}</div>
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px 4px 0', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Vendedor</div>
                  <div>{data.seller_name || 'N/A'}</div>
                </td>
                <td style={{ padding: '4px 0 4px 8px', verticalAlign: 'top', borderLeft: '1px solid #ddd' }}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Data de Criação</div>
                  <div>{formatDate(data.created_date)}</div>
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px 4px 0', verticalAlign: 'top' }} colSpan={2}>
                  <div style={{ fontWeight: 'bold', color: GREEN_DARK }}>Válido até</div>
                  <div>{data.valid_until ? formatDate(data.valid_until) : 'N/A'}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ITENS DO ORÇAMENTO */}
        <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
          <SectionHeader title="Itens do Orçamento" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
            <thead>
              <tr style={{ background: GREEN, color: '#fff' }}>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'left', width: '10%' }}>Referência</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'left' }}>Descrição</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '6%' }}>Un.</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '11%' }}>Quantidade</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '13%' }}>Unitário</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '10%' }}>Desconto</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '14%' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items?.map((item, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : GREY_BG }}>
                  <td style={{ border: '1px solid #ddd', padding: '5px' }}>{item.product_code || '-'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px' }}>{item.product_name}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right' }}>{formatBRL(item.unit_price)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right' }}>{formatBRL(item.discount || 0)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>{formatBRL(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <table style={{ width: '55%', fontSize: '9pt', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 10px', textAlign: 'right', background: GREY_BG, border: '1px solid #ddd' }}><strong>Total dos Itens</strong></td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', background: GREY_BG, border: '1px solid #ddd', fontWeight: 'bold' }}>{formatBRL(data.subtotal || 0)}</td>
                </tr>
                {data.discount > 0 && (
                  <tr>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd' }}><strong>Desconto</strong></td>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd', color: RED, fontWeight: 'bold' }}>- {formatBRL(data.discount)}</td>
                  </tr>
                )}
                {data.shipping > 0 && (
                  <tr>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd' }}><strong>Frete</strong></td>
                    <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{formatBRL(data.shipping)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd' }}><strong>Outros</strong></td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{formatBRL(0)}</td>
                </tr>
                <tr style={{ background: GREEN, color: '#fff' }}>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '10pt', border: `1px solid ${GREEN}` }}><strong>VALOR TOTAL</strong></td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11pt', fontWeight: 'bold', border: `1px solid ${GREEN}` }}>{formatBRL(data.total || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FORMA / CONDIÇÕES DE PAGAMENTO */}
        <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
          <SectionHeader title="Forma / Condições de Pagamento" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
            <thead>
              <tr style={{ background: GREEN, color: '#fff' }}>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'left' }}>Descrição</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '15%' }}>Vencimento</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'center', width: '15%' }}>Pagamento</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '15%' }}>Valor</th>
                <th style={{ border: `1px solid ${GREEN}`, padding: '5px', textAlign: 'right', width: '15%' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((row, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : GREY_BG }}>
                  <td style={{ border: '1px solid #ddd', padding: '5px' }}>{row.descricao}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{row.vencimento}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'center' }}>{row.pagamento}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right' }}>{formatBRL(row.valor)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '5px', textAlign: 'right', fontWeight: 'bold', color: row.saldo > 0 ? RED : GREEN }}>
                    {formatBRL(row.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* OBSERVAÇÕES */}
        {data.notes && (
          <div style={{ marginTop: '8px', position: 'relative', zIndex: 1 }}>
            <SectionHeader title="Observações" />
            <div style={{ border: '1px solid #ddd', padding: '6px 8px', minHeight: '14mm', fontSize: '8.5pt', whiteSpace: 'pre-wrap', color: '#333' }}>
              {data.notes}
            </div>
          </div>
        )}

        {/* ASSINATURAS */}
        <div style={{ marginTop: '16mm', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: '20mm' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt', color: '#333' }}>
                <strong>Assinatura do Cliente</strong>
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt', color: '#333' }}>
                <strong>Assinatura do Vendedor</strong>
              </div>
            </div>
          </div>
        </div>

        {/* RODAPÉ */}
        <div style={{ position: 'absolute', bottom: '4mm', left: '10mm', right: '10mm', textAlign: 'center', zIndex: 1 }}>
          <div style={{ background: GREEN, color: '#fff', padding: '5px', fontSize: '8.5pt', fontWeight: 'bold', letterSpacing: '0.5px', borderRadius: '3px' }}>
            SUSTENTABILIDADE QUE GERA PRODUTIVIDADE.
          </div>
          <div style={{ fontSize: '7.5pt', color: '#666', marginTop: '3px' }}>Este documento é um orçamento e não constitui uma venda final.</div>
          <div style={{ fontSize: '7.5pt', color: '#666' }}>Emitido em {formatDate(new Date().toISOString())}</div>
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

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-receipt, .print-receipt * {
            visibility: visible;
          }
          .print-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 8mm 10mm;
            box-sizing: border-box;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 210mm;
            height: 297mm;
            overflow: hidden;
          }
        }
      `}</style>
    </>
  );
}