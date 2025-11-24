import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { jsPDF } from 'npm:jspdf@2.5.1';
import autoTable from 'npm:jspdf-autotable@3.8.2';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportType, title, subtitle, data, columns, summary } = await req.json();
    const doc = new jsPDF();

    // Helper to add header
    const addHeader = () => {
      doc.setFontSize(18);
      doc.text(title || 'Relatório', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(subtitle || '', 14, 28);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 33);
      doc.text(`Por: ${user.full_name || user.email}`, 14, 38);
      
      doc.setLineWidth(0.5);
      doc.line(14, 42, 196, 42);
      doc.setTextColor(0);
    };

    addHeader();

    let finalY = 45;

    if (summary && summary.length > 0) {
        doc.setFontSize(12);
        doc.text("Resumo", 14, finalY + 5);
        finalY += 10;

        summary.forEach(item => {
            doc.setFontSize(10);
            doc.text(`${item.label}: ${item.value}`, 14, finalY);
            finalY += 6;
        });
        finalY += 5;
    }

    if (data && data.length > 0) {
      autoTable(doc, {
        startY: finalY,
        head: [columns.map(c => c.header)],
        body: data.map(row => columns.map(c => row[c.dataKey])),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { top: 45 },
        didDrawPage: function (data) {
            // Header on new pages
            if (data.pageNumber > 1) {
                 // Optional: Add simplified header
            }
        }
      });
    } else {
        doc.setFontSize(12);
        doc.text("Nenhum dado encontrado para o período selecionado.", 14, finalY + 10);
    }

    // Add footer with page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text('Página ' + i + ' de ' + pageCount, 196, 285, { align: 'right' });
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportType}_${Date.now()}.pdf"`
      }
    });

  } catch (error) {
    console.error("PDF Generation Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});