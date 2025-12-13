import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatBRL, formatDate, formatDateTime } from "@/components/utils/formatters";

export default function PaymentReceipt({ payment, sale, previousPayments = [] }) {
  const handlePrint = () => {
    window.print();
  };

  // Calcular saldos
  const totalPaidBefore = previousPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const saldoAnterior = sale.total - totalPaidBefore;
  const saldoRestante = saldoAnterior - payment.amount;

  return (
    <>
      <div className="no-print mb-4">
        <Button onClick={handlePrint} className="w-full">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Recibo de Pagamento
        </Button>
      </div>

      <div style={{
        width: '80mm',
        minHeight: '200mm',
        background: 'white',
        padding: '10mm',
        fontFamily: 'monospace',
        fontSize: '10pt',
        color: '#000',
        lineHeight: '1.4'
      }}>
        {/* CABEÇALHO */}
        <div style={{ textAlign: 'center', marginBottom: '15px', borderBottom: '2px dashed #000', paddingBottom: '10px' }}>
          <h1 style={{ fontSize: '14pt', fontWeight: 'bold', margin: '0 0 5px 0' }}>
            RECIBO DE PAGAMENTO
          </h1>
          <p style={{ fontSize: '9pt', margin: '0' }}>{sale.company_name || 'EMPRESA'}</p>
          {sale.company_cnpj && <p style={{ fontSize: '8pt', margin: '2px 0' }}>CNPJ: {sale.company_cnpj}</p>}
        </div>

        {/* DADOS DO PAGAMENTO */}
        <div style={{ marginBottom: '12px' }}>
          <p style={{ margin: '3px 0', fontSize: '9pt' }}>
            <strong>Venda:</strong> {sale.reference}
          </p>
          <p style={{ margin: '3px 0', fontSize: '9pt' }}>
            <strong>Cliente:</strong> {sale.client_name}
          </p>
          <p style={{ margin: '3px 0', fontSize: '9pt' }}>
            <strong>Data Pgto:</strong> {formatDate(payment.payment_date)}
          </p>
          <p style={{ margin: '3px 0', fontSize: '9pt' }}>
            <strong>Forma:</strong> {payment.payment_method}
          </p>
          {payment.notes && (
            <p style={{ margin: '3px 0', fontSize: '9pt' }}>
              <strong>Obs:</strong> {payment.notes}
            </p>
          )}
        </div>

        {/* VALORES */}
        <div style={{ 
          border: '2px solid #000', 
          padding: '10px', 
          marginBottom: '12px',
          background: '#f5f5f5'
        }}>
          <table style={{ width: '100%', fontSize: '9pt' }}>
            <tbody>
              <tr>
                <td style={{ padding: '3px 0' }}>Valor Total Venda:</td>
                <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 'bold' }}>
                  {formatBRL(sale.total)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '3px 0' }}>Saldo Anterior:</td>
                <td style={{ padding: '3px 0', textAlign: 'right' }}>
                  {formatBRL(saldoAnterior)}
                </td>
              </tr>
              <tr style={{ borderTop: '1px dashed #000' }}>
                <td style={{ padding: '6px 0 3px 0', fontSize: '11pt' }}>
                  <strong>Valor Pago:</strong>
                </td>
                <td style={{ padding: '6px 0 3px 0', textAlign: 'right', fontSize: '12pt', fontWeight: 'bold' }}>
                  {formatBRL(payment.amount)}
                </td>
              </tr>
              <tr style={{ borderTop: '2px solid #000' }}>
                <td style={{ padding: '6px 0 0 0', fontSize: '11pt' }}>
                  <strong>Saldo Restante:</strong>
                </td>
                <td style={{ 
                  padding: '6px 0 0 0', 
                  textAlign: 'right', 
                  fontSize: '13pt', 
                  fontWeight: 'bold',
                  color: saldoRestante > 0.01 ? '#d97706' : '#059669'
                }}>
                  {formatBRL(saldoRestante)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {saldoRestante > 0.01 && (
          <div style={{ 
            background: '#FEF3C7', 
            border: '1px solid #F59E0B',
            padding: '8px', 
            marginBottom: '12px',
            fontSize: '8pt',
            textAlign: 'center'
          }}>
            ⚠️ Pagamento restante em aberto
          </div>
        )}

        {saldoRestante <= 0.01 && (
          <div style={{ 
            background: '#D1FAE5', 
            border: '1px solid #10B981',
            padding: '8px', 
            marginBottom: '12px',
            fontSize: '8pt',
            textAlign: 'center',
            fontWeight: 'bold'
          }}>
            ✓ VENDA QUITADA
          </div>
        )}

        {/* ASSINATURA */}
        <div style={{ marginTop: '25px', textAlign: 'center' }}>
          <div style={{ 
            borderTop: '1px solid #000', 
            width: '70%', 
            margin: '0 auto', 
            paddingTop: '5px',
            fontSize: '8pt'
          }}>
            Assinatura do Cliente
          </div>
        </div>

        {/* RODAPÉ */}
        <div style={{ 
          marginTop: '20px', 
          textAlign: 'center', 
          fontSize: '7pt',
          borderTop: '1px dashed #999',
          paddingTop: '10px'
        }}>
          <p style={{ margin: '2px 0' }}>Recibo válido como comprovante de pagamento</p>
          <p style={{ margin: '2px 0' }}>Emitido em {formatDateTime(new Date().toISOString())}</p>
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
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}