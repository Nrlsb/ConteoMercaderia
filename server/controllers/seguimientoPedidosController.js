const supabase = require('../services/supabaseClient');
const pdf = require('pdf-parse');

// Función helper para crear notificaciones asociadas al pedido
async function createOrderNotifications(pedido, actorUsername, actionType) {
    try {
        const usernamesToNotify = new Set();
        if (pedido.quien_solicita && pedido.quien_solicita !== actorUsername) {
            usernamesToNotify.add(pedido.quien_solicita);
        }
        if (pedido.para_quien && pedido.para_quien !== actorUsername) {
            usernamesToNotify.add(pedido.para_quien);
        }
        if (pedido.contacto_mercurio && pedido.contacto_mercurio !== actorUsername) {
            usernamesToNotify.add(pedido.contacto_mercurio);
        }

        if (usernamesToNotify.size === 0) return;

        // Buscar los user_ids de estos usernames en la base de datos
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, username')
            .in('username', Array.from(usernamesToNotify));

        if (usersError) {
            console.error('Error fetching users for order notifications:', usersError);
            return;
        }

        if (!users || users.length === 0) return;

        const notifications = users.map(user => {
            let title = '';
            let message = '';
            const productoDesc = pedido.descripcion_capacidad || 'Producto sin especificar';
            const proveedor = pedido.proveedor_marca || 'Proveedor';

            if (actionType === 'create') {
                title = 'Nuevo pedido registrado';
                message = `El usuario ${actorUsername} registró un nuevo pedido para ${pedido.para_quien || 'Deposito'}: ${productoDesc} (${proveedor}).`;
            } else if (actionType === 'update') {
                title = 'Pedido actualizado';
                message = `El pedido de ${proveedor} (${productoDesc}) fue actualizado por ${actorUsername}. Estado: ${pedido.estado || 'Pendiente'}.`;
            }

            return {
                user_id: user.id,
                title,
                message,
                type: actionType === 'create' ? 'pedido_creado' : 'pedido_modificado',
                pedido_id: pedido.id,
                read: false
            };
        });

        const { error: insertError } = await supabase
            .from('notifications')
            .insert(notifications);

        if (insertError) {
            console.error('Error inserting order notifications:', insertError);
        }
    } catch (err) {
        console.error('Error in createOrderNotifications:', err);
    }
}

exports.getAllPedidos = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('seguimiento_pedidos')
            .select('*')
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching pedidos:', error);
        res.status(500).json({ message: 'Error al obtener pedidos' });
    }
};

exports.createPedido = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('seguimiento_pedidos')
            .insert([req.body])
            .select()
            .single();

        if (error) throw error;

        // Crear notificaciones en segundo plano
        createOrderNotifications(data, req.user?.username || 'Sistema', 'create');

        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating pedido:', error);
        res.status(500).json({ message: 'Error al crear el pedido' });
    }
};

exports.updatePedido = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('seguimiento_pedidos')
            .update(req.body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Crear notificaciones en segundo plano
        createOrderNotifications(data, req.user?.username || 'Sistema', 'update');

        res.json(data);
    } catch (error) {
        console.error('Error updating pedido:', error);
        res.status(500).json({ message: 'Error al actualizar el pedido' });
    }
};


exports.deletePedido = async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('seguimiento_pedidos')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Pedido eliminado con éxito' });
    } catch (error) {
        console.error('Error deleting pedido:', error);
        res.status(500).json({ message: 'Error al eliminar el pedido' });
    }
};

// Importar desde PDF
exports.importPedidosPdf = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No se ha subido ningún archivo PDF' });
    }

    try {
        const dataBuffer = req.file.buffer;
        
        // Custom page rendering to preserve horizontal spaces (similar to receipts/remitos parser)
        function render_page(pageData) {
            let render_options = {
                normalizeWhitespace: false,
                disableCombineTextItems: false
            };

            return pageData.getTextContent(render_options)
                .then(function (textContent) {
                    let lines = {};
                    for (let item of textContent.items) {
                        let y = Math.round(item.transform[5]);
                        let x = Math.round(item.transform[4]);
                        if (!lines[y]) lines[y] = [];
                        lines[y].push({ x, str: item.str, width: item.width || 0 });
                    }

                    let sortedY = Object.keys(lines).sort((a, b) => b - a);
                    let text = '';

                    let groups = [];
                    if (sortedY.length > 0) {
                        let currentGroup = [sortedY[0]];
                        for (let i = 1; i < sortedY.length; i++) {
                            if (Math.abs(sortedY[i] - sortedY[i - 1]) < 5) {
                                currentGroup.push(sortedY[i]);
                            } else {
                                groups.push(currentGroup);
                                currentGroup = [sortedY[i]];
                            }
                        }
                        groups.push(currentGroup);
                    }

                    for (let group of groups) {
                        let groupItems = [];
                        for (let y of group) {
                            groupItems = groupItems.concat(lines[y]);
                        }
                        groupItems.sort((a, b) => a.x - b.x);

                        let lineText = '';
                        let lastX = 0;
                        for (let item of groupItems) {
                            let distance = item.x - lastX;
                            let gap = distance > 1.5 ? Math.max(1, Math.floor(distance / 4.0)) : 0;
                            lineText += ' '.repeat(gap) + item.str;
                            lastX = item.x + (item.width || (item.str.length * 4.0));
                        }
                        text += lineText + '\n';
                    }
                    return text;
                });
        }

        const data = await pdf(dataBuffer, { pagerender: render_page });
        const lines = data.text.split('\n');
        
        const parsedItems = [];
        
        // Expresión para buscar líneas que empiecen con fecha (ej. 24/06/2025 o 1/07/2025 o 02/07/2025)
        const dateRegex = /^\s*(\d{1,2}\/\d{1,2}\/\d{4})/i;

        // Sucursales y destinatarios comunes
        const entities = ['Sucursal \\d+', 'Stock Mercurio', 'Compras', 'Diego Villata', 'Villata Diego', 'Fogar Ezequiel', 'Ramirez Jonatan', 'Dilucca Matias', 'Matias Dilucca'];
        const entityPattern = `(${entities.join('|')})`;

        // Proveedores comunes
        const providers = ['Saint Gobain', 'Enimar', 'Diproel', 'Tersuave', 'Elsener', 'Akzo Nobel', 'Burger', 'Pint. Rex', 'Pinturerias Rex', 'Zeocar', 'Alba', 'Sin Fin'];
        const providerPattern = `(${providers.join('|')})`;

        // Contactos comunes
        const contacts = ['Marisol', 'Cristofer', 'Damián', 'Damian', 'Alejandro', 'Jonatan', 'Martin', 'Sergio', 'Fabiana Luciano', 'Maxi Abruzzecce', 'M. Abruzzece', 'María Sol', 'Georgina', 'Denis'];
        const contactPattern = `(${contacts.join('|')})`;

        for (let line of lines) {
            const trimmed = line.trim();
            const dateMatch = trimmed.match(dateRegex);
            if (!dateMatch) continue;

            const dateStr = dateMatch[1];
            let remainingText = trimmed.replace(dateStr, '').trim();

            // Intentar extraer "Quién solicita" y "Para quién"
            let quien_solicita = '';
            let para_quien = '';

            // Intentar hacer match de dos entidades juntas
            const entityRegex = new RegExp(`^\\s*${entityPattern}\\s*${entityPattern}`, 'i');
            const entityMatch = remainingText.match(entityRegex);
            if (entityMatch) {
                quien_solicita = entityMatch[1];
                para_quien = entityMatch[2];
                remainingText = remainingText.replace(entityMatch[0], '').trim();
            } else {
                // Si solo hay una
                const singleEntityRegex = new RegExp(`^\\s*${entityPattern}`, 'i');
                const singleMatch = remainingText.match(singleEntityRegex);
                if (singleMatch) {
                    quien_solicita = singleMatch[1];
                    para_quien = singleMatch[1]; // fallback
                    remainingText = remainingText.replace(singleMatch[0], '').trim();
                }
            }

            // Proveedor
            let proveedor_marca = '';
            const providerRegex = new RegExp(`^\\s*${providerPattern}`, 'i');
            const providerMatch = remainingText.match(providerRegex);
            if (providerMatch) {
                proveedor_marca = providerMatch[1];
                remainingText = remainingText.replace(providerMatch[0], '').trim();
            }

            // Tildes booleanas: ej. xx o x al inicio del texto restante
            let urgencia = false;
            let rotacion = false;
            let transp_mercurio = false;
            let otro_transporte = false;

            const flagsMatch = remainingText.match(/^\s*(x{1,4}|-{1,4})/i);
            if (flagsMatch) {
                const flags = flagsMatch[1].toLowerCase();
                if (flags.includes('x')) {
                    // Si hay tildes, simplificamos:
                    urgencia = flags.length >= 1;
                    rotacion = flags.length >= 2;
                    transp_mercurio = flags.length >= 3;
                    otro_transporte = flags.length >= 4;
                }
                remainingText = remainingText.replace(flagsMatch[0], '').trim();
            }

            // Código Mercurio (suele ser 6 dígitos, ej: 001100 o 005212)
            let codigo_mercurio = '';
            const codeMatch = remainingText.match(/^(\d{5,6})/);
            if (codeMatch) {
                codigo_mercurio = codeMatch[1];
                remainingText = remainingText.replace(codigo_mercurio, '').trim();
            }

            // Cantidad y Unidad (ej: 1,000 UNIDAD o 20,000 LITROS)
            let cant_pedido = null;
            let descripcion_capacidad = '';
            const qtyUnitRegex = /^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(UNIDAD|LITROS|KILOS|UNI|LT|KG|LTS|KGS)/i;
            const qtyMatch = remainingText.match(qtyUnitRegex);
            if (qtyMatch) {
                const rawQty = qtyMatch[1];
                cant_pedido = parseFloat(rawQty.replace(/\./g, '').replace(',', '.'));
                descripcion_capacidad = qtyMatch[2];
                remainingText = remainingText.replace(qtyMatch[0], '').trim();
            }

            // N° Pedido Compra (suele ser un número después de la unidad, o a veces con guión)
            let nro_pedido_compra = '';
            const purchaseOrderRegex = /^\s*(?:-)?\s*(\d+)\s*/;
            const poMatch = remainingText.match(purchaseOrderRegex);
            if (poMatch) {
                nro_pedido_compra = poMatch[1];
                remainingText = remainingText.replace(poMatch[0], '').trim();
            }

            // Contacto Mercurio (buscar nombres conocidos en el texto restante)
            let contacto_mercurio = '';
            const contactRegex = new RegExp(`\\b${contactPattern}\\b`, 'i');
            const contactMatch = remainingText.match(contactRegex);
            if (contactMatch) {
                contacto_mercurio = contactMatch[1];
                remainingText = remainingText.replace(contactMatch[0], '').trim();
            }

            // Estado (usualmente contiene "Recibido", "REcibido", "RECIBIDO", "entrada", etc.)
            let estado = 'Pendiente';
            const statusMatch = remainingText.match(/(recibido|recicbido|resibido|entregado|entrada|pendiente)[^\n]*/i);
            if (statusMatch) {
                estado = statusMatch[0].trim();
                remainingText = remainingText.replace(statusMatch[0], '').trim();
            }

            // El texto sobrante suele ser fechas de seguimiento, comentarios o previsión de entrada
            let prev_entrada = remainingText.replace(/[-\s,]+$/, '').trim();

            // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
            let formattedDate = null;
            if (dateStr) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }

            parsedItems.push({
                fecha: formattedDate || new Date().toISOString().split('T')[0],
                quien_solicita: quien_solicita || 'Compras',
                para_quien: para_quien || 'Deposito',
                nro_pedido_venta: '',
                proveedor_marca: proveedor_marca || 'Otro',
                nro_pedido: '',
                urgencia,
                rotacion,
                transp_mercurio,
                otro_transporte,
                codigo_mercurio,
                descripcion_capacidad: descripcion_capacidad || 'Producto',
                cant_pedido: cant_pedido || 0,
                prev_entrada: prev_entrada,
                nro_pedido_compra: nro_pedido_compra,
                recepcion_parcial: '',
                contacto_mercurio: contacto_mercurio || 'Operador',
                contacto_proveedor: '',
                estado: estado
            });
        }

        // Guardar los registros parseados en la base de datos
        if (parsedItems.length > 0) {
            const { data: insertedData, error: insertError } = await supabase
                .from('seguimiento_pedidos')
                .insert(parsedItems)
                .select();

            if (insertError) throw insertError;
            
            return res.json({
                message: `Se importaron ${parsedItems.length} pedidos correctamente desde el PDF.`,
                count: parsedItems.length,
                data: insertedData
            });
        } else {
            return res.status(400).json({ message: 'No se encontraron registros válidos para importar en el PDF.' });
        }

    } catch (error) {
        console.error('Error al importar PDF de pedidos:', error);
        res.status(500).json({ message: 'Error interno al procesar el PDF' });
    }
};

const xlsx = require('xlsx');

exports.exportPedidosExcel = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('seguimiento_pedidos')
            .select('*')
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedData = data.map(p => ({
            'Fecha': p.fecha,
            'Quién Solicita': p.quien_solicita || '',
            'Para Quién': p.para_quien || '',
            'N° Pedido Venta': p.nro_pedido_venta || '',
            'Proveedor/Marca': p.proveedor_marca || '',
            'N° de Pedido': p.nro_pedido || '',
            'Código Producto Proveed.': p.codigo_producto_proveed || '',
            'Urgencia': p.urgencia ? 'SÍ' : 'NO',
            'Rotación': p.rotacion ? 'SÍ' : 'NO',
            'Transp. Mercurio': p.transp_mercurio ? 'SÍ' : 'NO',
            'Otro Transporte': p.otro_transporte ? 'SÍ' : 'NO',
            'Código Mercurio': p.codigo_mercurio || '',
            'Descripción/Capacidad': p.descripcion_capacidad || '',
            'Cant. Pedido': p.cant_pedido || 0,
            'Prev. Entrada': p.prev_entrada || '',
            'N° Pedido Compra': p.nro_pedido_compra || '',
            'Recepción Parcial (Comentarios)': p.recepcion_parcial || '',
            'Cant. Recep. Parcial': p.cant_recepcion_parcial || '',
            'Contacto Mercurio - ¿Quién?': p.contacto_mercurio || '',
            'Contacto Mercurio - ¿Fechas?': p.contacto_mercurio_fecha || '',
            'Contacto Proveedor - ¿Quién?': p.contacto_proveedor || '',
            'Contacto Proveedor - ¿Fechas?': p.contacto_proveedor_fecha || '',
            'Estado': p.estado || 'Pendiente'
        }));

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(formattedData);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Seguimiento Pedidos');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Seguimiento_Pedidos_2025.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error('Error al exportar pedidos a Excel:', error);
        res.status(500).json({ message: 'Error interno al generar el archivo Excel' });
    }
};

