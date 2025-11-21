
import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatBRL, formatDate } from "@/components/utils/formatters";

export default function QuoteReceipt({ data, onPrint }) {
  const handlePrint = () => {
    window.print();
    if (onPrint) onPrint();
  };

  return (
    <>
      <div className="no-print mb-4">
        <Button onClick={handlePrint} className="w-full">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Orçamento
        </Button>
      </div>

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

        {/* INFORMAÇÕES GERAIS */}
        <div style={{ marginBottom: '15px', border: '1px solid #ddd', padding: '10px', background: '#f9f9f9' }}>
          <h3 style={{ 
            fontSize: '11pt', 
            fontWeight: 'bold', 
            margin: '0 0 8px 0', 
            borderBottom: '1px solid #ccc', 
            paddingBottom: '5px',
            color: '#1B3C73'
          }}>
            🧾 Informações Gerais
          </h3>
          <table style={{ width: '100%', fontSize: '9pt' }}>
            <tbody>
              <tr>
                <td style={{ width: '50%', padding: '3px 0' }}><strong>Cliente:</strong> {data.client_name || ''}</td>
                <td style={{ width: '50%', padding: '3px 0' }}><strong>Vendedor:</strong> {data.seller_name || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ padding: '3px 0' }}><strong>Data de Emissão:</strong> {formatDate(data.quote_date)}</td>
                <td style={{ padding: '3px 0' }}><strong>Validade:</strong> {formatDate(data.validity_date)}</td>
              </tr>
            </tbody>
          </table>
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
                <th style={{ border: '1px solid #E2E8F0', padding: '8px', textAlign: 'left', color: '#1B3C73', fontWeight: 'bold', width: '40%' }}>Descrição</th>
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

        {/* TOTAIS */}
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
                <tr style={{ borderTop: '2px solid #1B3C73' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11pt', color: '#0B1E3C' }}><strong>Valor Total:</strong></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12pt', fontWeight: 'bold', color: '#1B3C73' }}>{formatBRL(data.total || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
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

        {/* VALIDADE */}
        <div style={{ marginTop: '20px', padding: '12px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px' }}>
          <p style={{ margin: '0', fontSize: '9pt', color: '#92400E', textAlign: 'center' }}>
            <strong>⏰ Orçamento válido até: {formatDate(data.validity_date)}</strong>
          </p>
        </div>

        {/* RODAPÉ */}
        <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '8pt', color: '#666', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
          <p style={{ margin: '0' }}>Este é um orçamento sem valor fiscal.</p>
          <p style={{ margin: '5px 0 0 0' }}>Emitido em {formatDate(new Date().toISOString())}</p>
        </div>
      </div>

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
