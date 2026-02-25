const fs = require('fs');
const xlsx = require('xlsx');
const { parseExcelXml } = require('./xmlParser');

async function compare() {
    try {
        const normalize = (c) => String(c).trim().replace(/^0+/, '');

        // 1. Parse XML
        const xmlData = fs.readFileSync('ConteoSuc2.xml');
        const xmlResult = await parseExcelXml(xmlData);
        const xmlItems = xmlResult.items.map(i => ({ code: normalize(i.code), desc: i.description.trim().toUpperCase() }));
        const xmlCodes = new Set(xmlItems.map(i => i.code));
        console.log('XML Unique Codes (normalized):', xmlCodes.size);

        // 2. Parse XLSX Import
        const xlsxImportData = fs.readFileSync('ConteoSuc2(1).xlsx');
        const xlsxImportResult = await parseExcelXml(xlsxImportData);
        const xlsxImportItems = xlsxImportResult.items.map(i => ({ code: normalize(i.code), desc: i.description.trim().toUpperCase() }));
        const xlsxImportCodes = new Set(xlsxImportItems.map(i => i.code));
        console.log('XLSX Import Unique Codes (normalized):', xlsxImportCodes.size);

        // 3. Parse Report
        const reportWb = xlsx.readFile('Reporte_63a6670c-7892-4c72-a008-2372eb86a43c (1).xlsx');
        const reportSheet = reportWb.Sheets['Diferencias'];
        const reportRows = xlsx.utils.sheet_to_json(reportSheet);
        const reportItems = reportRows.map(r => ({
            code: normalize(r.Codigo || r.codigo),
            desc: String(r.Descripcion || '').trim().toUpperCase()
        }));
        const reportCodes = new Set(reportItems.map(i => i.code));
        console.log('Report Unique Codes (normalized):', reportCodes.size);

        // Union of imports
        const allImportCodes = new Set([...xmlCodes, ...xlsxImportCodes]);
        console.log('Total Unique Import Codes (normalized):', allImportCodes.size);

        // Intersection
        const commonCodes = [...allImportCodes].filter(c => reportCodes.has(c));
        console.log('Common Codes Found:', commonCodes.size || commonCodes.length);

        // If common codes is low, check by description
        if (commonCodes.length < 50) {
            console.log('Low code overlap. Checking descriptions...');
            const importDescs = new Set([...xmlItems, ...xlsxImportItems].map(i => i.desc));
            const commonDescs = reportItems.filter(i => importDescs.has(i.desc));
            console.log('Common Descriptions Found:', commonDescs.length);
        }

        // Comparison
        const onlyInImport = [...allImportCodes].filter(c => !reportCodes.has(c));
        const onlyInReport = [...reportCodes].filter(c => !allImportCodes.has(c));

        console.log('Items only in Imports:', onlyInImport.length);
        console.log('Items only in Report:', onlyInReport.length);


        if (onlyInReport.length > 0) {
            console.log('Sample missing in Import:', onlyInReport.slice(0, 5));
        }

        if (onlyInImport.length > 0) {
            console.log('Sample missing in Report:', onlyInImport.slice(0, 5));
        }

    } catch (e) {
        console.error('Comparison failed:', e);
    }
}

compare();
