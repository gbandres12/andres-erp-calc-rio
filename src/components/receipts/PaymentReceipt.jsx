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

        {/* VALOR ABATIDO EM DESTAQUE */}
        <div style={{ background: '#000', color: '#fff', textAlign: 'center', padding: '10px 6px', borderRadius: '4px', marginBottom: '10px' }}>
          <div style={{ fontSize: '8pt', letterSpacing: '2px', fontWeight: 'bold' }}>VALOR ABATIDO</div>
          <div style={{ fontSize: '22pt', fontWeight: 'bold', fontFamily: 'Arial, sans-serif', marginTop: '2px' }}>
            {formatBRL(payment.amount)}
          </div>
          {payment.discount > 0 && (
            <div style={{ fontSize: '9pt', marginTop: '3px' }}>+ desconto {formatBRL(payment.discount)}</div>
          )}
        </div>

        {/* VALORES */}
        <div style={{ border: '2px solid #000', padding: '8px 10px', marginBottom: '10px', fontFamily: 'Arial, sans-serif' }}>
          <table style={{ width: '100%', fontSize: '10pt', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 0' }}>Total da Venda</td>
                <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 'bold', fontSize: '12pt' }}>{formatBRL(sale.total)}</td>
              </tr>
              <tr style={{ borderTop: '1px dashed #000' }}>
                <td style={{ padding: '4px 0' }}>Saldo Anterior</td>
                <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 'bold', fontSize: '12pt' }}>{formatBRL(saldoAnterior)}</td>
              </tr>
              <tr style={{ borderTop: '1px dashed #000' }}>
                <td style={{ padding: '4px 0' }}>(−) Abatido agora</td>
                <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 'bold', fontSize: '12pt' }}>{formatBRL(payment.amount)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ borderTop: '2px solid #000', marginTop: '6px', paddingTop: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '8pt', letterSpacing: '1.5px', fontWeight: 'bold' }}>SALDO RESTANTE</div>
            <div style={{ fontSize: '20pt', fontWeight: 'bold', color: saldoRestante > 0.01 ? '#b45309' : '#047857' }}>
              {formatBRL(saldoRestante)}
            </div>
          </div>
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