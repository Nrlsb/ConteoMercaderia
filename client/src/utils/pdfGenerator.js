const loadScript = (url) => {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
};

const formatCurrency = (val) => {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
};

export const generateColorPDF = async (
  color,
  activeRecipe,
  activeSizeObj,
  selectedCanSize,
  pigmentsWithCosts,
  precioBase,
  precioPigmentosTotal,
  observation,
  allowFormulaDisplay
) => {
  try {
    // Cargar jsPDF y jsPDFAutoTable dinámicamente si no están definidos
    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    
    // El plugin autotable requiere jsPDF global, por lo que esperamos a que se registre
    if (!window.jspdfAutoTable) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/jspdf.plugin.autotable.min.js');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const brandName = color.id >= 5000000 ? 'Tersuave' : color.id >= 4000000 ? 'Plavicon' : 'Alba';

    // --- PALETA DE COLORES DEL PDF ---
    const primaryColor = [24, 59, 100]; // #183B64 (Azul Espint)
    const secondaryColor = [79, 70, 229]; // Índigo para detalles
    const textColorDark = [31, 41, 55]; // Gris oscuro
    const textColorLight = [107, 114, 128]; // Gris claro
    const borderColor = [229, 231, 235]; // Borde suave

    // --- ENCABEZADO ---
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...primaryColor);
    doc.text("FICHA DE DOSIFICACIÓN DE COLOR", 14, 20);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...textColorLight);
    doc.text(`Espint Pinturerías — Generado el ${new Date().toLocaleDateString('es-AR')} a las ${new Date().toLocaleTimeString('es-AR')}`, 14, 26);

    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.5);
    doc.line(14, 30, 196, 30);

    // --- SECCIÓN 1: DETALLE VISUAL DEL COLOR ---
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(color.hex);
    doc.rect(14, 35, 45, 35, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...textColorDark);
    doc.text(color.nombre, 65, 42);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text(`Código: ${color.codigo}`, 65, 48);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...textColorLight);
    doc.text(`Marca / Carta: ${brandName}`, 65, 54);
    doc.text(`Catálogo: ${color.coleccion || 'General'}`, 65, 60);

    doc.line(14, 75, 196, 75);

    // --- SECCIÓN 2: DETALLES DE DOSIFICACIÓN ---
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...primaryColor);
    doc.text("Detalle del Producto Base", 14, 83);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...textColorDark);
    
    doc.text("Producto Base:", 14, 91);
    doc.setFont("Helvetica", "bold");
    doc.text(`${activeRecipe?.productName || 'No especificado'}`, 48, 91);
    
    doc.setFont("Helvetica", "normal");
    doc.text("Capacidad:", 14, 97);
    doc.setFont("Helvetica", "bold");
    const displaySize = selectedCanSize >= 100 ? selectedCanSize / 1000 : selectedCanSize;
    const sizeStr = String(displaySize).replace('.', ',');
    const isKg = activeSizeObj?.unidad?.toLowerCase() === 'kg';
    const unitStr = isKg ? 'kg' : `Litro${displaySize !== 1 ? 's' : ''}`;
    doc.text(`${sizeStr} ${unitStr}`, 48, 97);
    
    doc.setFont("Helvetica", "normal");
    doc.text("Base Requerida:", 14, 103);
    doc.setFont("Helvetica", "bold");
    doc.text(`Base ${activeRecipe?.base || 'General'}`, 48, 103);

    let currentY = 112;

    // --- SECCIÓN 3: TABLA DE FORMULACIÓN ---
    if (allowFormulaDisplay && pigmentsWithCosts && pigmentsWithCosts.length > 0) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...primaryColor);
      doc.text("Fórmula de Dosificación", 14, currentY);
      currentY += 4;

      const headers = [["Código", "Pigmento / Colorante", "Impulso / Cantidad", "Costo Estimado"]];
      const data = pigmentsWithCosts.map(pig => [
        pig.code,
        pig.name,
        pig.displayQty,
        pig.precio_lata ? formatCurrency(pig.costoPig) : '$0,00'
      ]);

      doc.autoTable({
        startY: currentY,
        head: headers,
        body: data,
        theme: 'striped',
        headStyles: { 
          fillColor: primaryColor, 
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        margin: { left: 14, right: 14 },
        styles: { 
          fontSize: 9, 
          cellPadding: 2.5,
          valign: 'middle'
        },
        columnStyles: {
          0: { width: 25, fontStyle: 'bold' },
          2: { halign: 'right' },
          3: { halign: 'right', textColor: secondaryColor, fontStyle: 'bold' }
        },
        didDrawPage: (data) => {
          currentY = data.cursor.y;
        }
      });

      currentY += 8;
    } else {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(180, 83, 9);
      doc.text("Fórmula de dosificación: Reservada / Oculta", 14, currentY);
      currentY += 8;
    }

    // --- SECCIÓN 4: RESUMEN DE PRECIOS ---
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...borderColor);
    doc.roundedRect(14, currentY, 182, 28, 2, 2, "FD");

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...textColorDark);
    
    doc.text("Precio Pintura Base:", 18, currentY + 7);
    const baseText = precioBase !== null ? formatCurrency(precioBase) : "No disponible";
    doc.setFont("Helvetica", "bold");
    doc.text(baseText, 190, currentY + 7, { align: 'right' });

    doc.setFont("Helvetica", "normal");
    doc.text("Precio Colorantes / Pigmentos:", 18, currentY + 13);
    doc.setFont("Helvetica", "bold");
    doc.text(formatCurrency(precioPigmentosTotal), 190, currentY + 13, { align: 'right' });

    doc.setDrawColor(220, 224, 230);
    doc.line(18, currentY + 17, 192, currentY + 17);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...primaryColor);
    doc.text("PRECIO TOTAL ESTIMADO:", 18, currentY + 23);
    const totalEstimado = precioBase !== null ? precioBase + precioPigmentosTotal : null;
    const totalText = totalEstimado !== null ? formatCurrency(totalEstimado) : "Falta precio base";
    doc.text(totalText, 190, currentY + 23, { align: 'right' });

    currentY += 36;

    // --- SECCIÓN 5: OBSERVACIONES ---
    if (observation && observation.trim() !== '') {
      doc.setFillColor(254, 253, 237);
      doc.setDrawColor(254, 243, 199);
      doc.roundedRect(14, currentY, 182, 26, 2, 2, "FD");

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(146, 64, 14);
      doc.text("Observaciones del Color:", 18, currentY + 6);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      
      const splitObs = doc.splitTextToSize(observation, 174);
      doc.text(splitObs, 18, currentY + 12);
    }

    // --- PIE DE PÁGINA ---
    const pageHeight = doc.internal.pageSize.height;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...textColorLight);
    doc.text("Este documento es una estimación de dosificación y costo provista por Espint Pinturerías.", 14, pageHeight - 10);
    doc.text("Los valores pueden variar sin previo aviso.", 14, pageHeight - 6);

    const cleanColorName = color.nombre.replace(/\s+/g, '_');
    doc.save(`Ficha_Color_${cleanColorName}_${color.codigo.trim()}.pdf`);
  } catch (error) {
    console.error("Error al generar PDF dinámicamente:", error);
    alert("Hubo un error al generar el PDF. Asegúrate de tener conexión a internet para descargar la librería de PDF.");
  }
};
