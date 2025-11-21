
import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatBRL, formatDate, formatDateTime } from "@/components/utils/formatters";

export default function ThermalReceipt({ type, data, onPrint }) {
  const handlePrint = () => {
    window.print();
    if (onPrint) onPrint();
  };

  // Centralizar texto
  const center = (text, width = 48) => {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  };

  // Alinhar valor à direita
  const rightAlign = (text, width = 48) => {
    const padding = Math.max(0, width - text.length);
    return ' '.repeat(padding) + text;
  };

  // Linha divisória sólida
  const solidLine = () => '================================================';
  
  // Linha pontilhada
  const dottedLine = () => '------------------------------------------------';

  // Quebrar texto
  const wrapText = (text, maxWidth = 46) => {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const renderSaleReceipt = () => {
    const lines = [];

    // CABEÇALHO
    lines.push(rightAlign(formatDateTime(data.sale_date || data.created_date)));
    lines.push('');
    lines.push(center(data.company_name || 'EMPRESA'));
    lines.push('');
    
    if (data.company_address) {
      const addressLines = wrapText(data.company_address, 48);
      addressLines.forEach(l => lines.push(l));
    }
    
    lines.push(`Cliente: ${data.client_name || ''}`);
    
    if (data.seller_name) {
      lines.push(`Vendedor: ${data.seller_name}`);
    }
    
    lines.push(`Venda (n: ${data.reference || ''})`);
    lines.push('');
    
    // LINHA DIVISÓRIA
    lines.push(solidLine());
    
    // CABEÇALHO DOS ITENS
    lines.push('Descricao / Quantidade X Unitario      Total');
    
    // ITENS
    if (data.items && data.items.length > 0) {
      data.items.forEach((item, idx) => {
        // Nome do produto
        const prodLines = wrapText(item.product_name, 48);
        prodLines.forEach(l => lines.push(l));
        
        // Quantidade x Preço unitário e Total na mesma linha
        const qtyPrice = `${item.quantity} (${item.unit}) X ${formatBRL(item.unit_price)}`;
        const total = formatBRL(item.total);
        const spaces = 48 - qtyPrice.length - total.length;
        lines.push(qtyPrice + ' '.repeat(Math.max(1, spaces)) + total);
        
        // Linha pontilhada entre itens
        if (idx < data.items.length - 1) {
          lines.push(dottedLine());
        }
      });
    }
    
    lines.push(solidLine());
    
    // TOTALIZADORES
    const rightValue = (label, value) => {
      const valueStr = formatBRL(value);
      const spaces = 48 - label.length - valueStr.length;
      return label + ' '.repeat(Math.max(1, spaces)) + valueStr;
    };

    lines.push(rightValue('Total Produtos', data.subtotal));
    
    if (data.discount > 0) {
      lines.push(rightValue('Desconto', -data.discount));
    }
    
    const subtotalAfterDiscount = data.subtotal - data.discount;
    lines.push(rightValue('Subtotal', subtotalAfterDiscount));
    
    if (data.shipping > 0) {
      lines.push(rightValue('Taxa Entr./Frete', data.shipping));
    }
    
    lines.push(rightValue('Total a Pagar', data.total));
    
    if (data.payment_method) {
      const methodName = {
        'dinheiro': 'Dinheiro',
        'pix': 'PIX',
        'cartao_credito': 'Cartao Credito',
        'cartao_debito': 'Cartao Debito',
        'transferencia': 'Transferencia',
        'cheque': 'Cheque'
      }[data.payment_method] || data.payment_method;
      
      lines.push(rightValue(methodName, data.paid_amount || data.total));
    }
    
    lines.push('');
    lines.push(dottedLine());
    
    // OBSERVAÇÕES
    if (data.notes) {
      lines.push(`Obs.: ${data.notes}`);
      lines.push('');
    }
    
    // RODAPÉ
    lines.push(center('Volte sempre!'));
    lines.push('');
    
    return lines.join('\n');
  };

  const renderPaymentReceipt = () => {
    const isReceita = data.type === 'receita';
    const lines = [];

    // CABEÇALHO
    lines.push(rightAlign(formatDateTime(data.payment_date || data.created_date)));
    lines.push('');
    lines.push(center(data.company_name || 'EMPRESA'));
    lines.push('');
    
    if (data.company_address) {
      const addressLines = wrapText(data.company_address, 48);
      addressLines.forEach(l => lines.push(l));
    }
    
    if (data.company_phone) {
      lines.push(center(`Tel: ${data.company_phone}`));
    }
    
    lines.push('');
    lines.push(center(isReceita ? '*** RECIBO DE RECEBIMENTO ***' : '*** COMPROVANTE DE PAGAMENTO ***'));
    lines.push('');
    lines.push(solidLine());
    lines.push('');
    
    // DADOS
    lines.push(isReceita ? 'Recebemos de:' : 'Pagamento efetuado para:');
    lines.push(data.contact_name || 'N/A');
    lines.push('');
    
    lines.push('Descricao:');
    const descLines = wrapText(data.description || '', 48);
    descLines.forEach(l => lines.push(l));
    lines.push('');
    
    if (data.category) {
      lines.push(`Categoria: ${data.category}`);
      lines.push('');
    }
    
    lines.push(solidLine());
    lines.push('');
    
    // VALORES
    const rightValue = (label, value) => {
      const valueStr = formatBRL(value);
      const spaces = 48 - label.length - valueStr.length;
      return label + ' '.repeat(Math.max(1, spaces)) + valueStr;
    };

    lines.push(rightValue('Valor Total', data.amount));
    
    if (data.paid_amount > 0 && data.paid_amount < data.amount) {
      lines.push(rightValue('Valor Pago', data.paid_amount));
      lines.push(rightValue('Saldo Restante', data.amount - data.paid_amount));
    }
    
    lines.push('');
    lines.push(solidLine());
    lines.push('');
    
    if (data.account_name) {
      lines.push(`Conta: ${data.account_name}`);
      lines.push('');
    }
    
    if (data.notes) {
      lines.push(`Obs.: ${data.notes}`);
      lines.push('');
    }
    
    lines.push(center(isReceita ? 'RECEBIDO COM SUCESSO!' : 'PAGAMENTO EFETUADO!'));
    lines.push('');
    lines.push(center('Obrigado!'));
    lines.push('');
    
    return lines.join('\n');
  };

  return (
    <div className="thermal-receipt">
      <div className="no-print mb-4">
        <Button onClick={handlePrint} className="w-full">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Recibo
        </Button>
      </div>

      <div className="receipt-content">
        <pre className="receipt-text">
          {type === 'sale' ? renderSaleReceipt() : renderPaymentReceipt()}
        </pre>
      </div>

      <style jsx>{`
        .thermal-receipt {
          max-width: 320px;
          margin: 0 auto;
        }

        .receipt-content {
          background: white;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }

        .receipt-text {
          font-family: 'Courier New', Courier, monospace;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.5;
          margin: 0;
          white-space: pre;
          overflow-x: auto;
          color: #000;
          letter-spacing: 0.5px;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          .thermal-receipt {
            max-width: 80mm;
            margin: 0;
          }

          .receipt-content {
            border: none;
            padding: 0;
          }

          .receipt-text {
            font-size: 11px;
            font-weight: 700;
            line-height: 1.4;
            color: #000;
          }

          @page {
            size: 80mm auto;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
