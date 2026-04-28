const supabase = require('../services/supabaseClient');

exports.getProductStock = async (req, res) => {
    const { code } = req.params;
    try {
        // 1. Get Product Info (including global stock)
        const { data: product, error: prodError } = await supabase
            .from('products')
            .select('code, description, current_stock')
            .eq('code', code)
            .single();

        if (prodError) throw prodError;

        // 2. Get Branch Stock
        const { data: branchStock, error: stockError } = await supabase
            .from('stock_sucursal')
            .select('sucursal_id, quantity, sucursales(name)')
            .eq('product_code', code);

        if (stockError) throw stockError;

        // 3. Combine
        const { data: allBranches } = await supabase.from('sucursales').select('id, name');

        const stocks = allBranches.map(branch => {
            if (branch.name === 'Deposito') {
                const entry = branchStock.find(s => s.sucursal_id === branch.id);
                return {
                    sucursal_id: branch.id,
                    sucursal_name: branch.name,
                    quantity: entry ? entry.quantity : (product.current_stock || 0)
                };
            }

            const entry = branchStock.find(s => s.sucursal_id === branch.id);
            return {
                sucursal_id: branch.id,
                sucursal_name: branch.name,
                quantity: entry ? entry.quantity : 0
            };
        });

        res.json({ product, stocks });
    } catch (error) {
        console.error('Error fetching stock:', error);
        res.status(500).json({ message: 'Error fetching stock' });
    }
};

exports.updateProductStock = async (req, res) => {
    const { code } = req.params;
    const { sucursal_id, quantity, operation } = req.body; // operation: 'set', 'add', 'subtract'

    if (!sucursal_id || quantity === undefined) return res.status(400).json({ message: 'Missing parameters' });

    try {
        const { data: branch } = await supabase.from('sucursales').select('name').eq('id', sucursal_id).single();
        const isDeposito = branch && branch.name === 'Deposito';

        let newQuantity = Number(quantity);

        if (operation && operation !== 'set') {
            const { data: current } = await supabase
                .from('stock_sucursal')
                .select('quantity')
                .match({ product_code: code, sucursal_id })
                .maybeSingle();

            const currentQty = current ? Number(current.quantity) : 0;
            if (operation === 'add') newQuantity = currentQty + newQuantity;
            if (operation === 'subtract') newQuantity = currentQty - newQuantity;
        }

        const { error } = await supabase
            .from('stock_sucursal')
            .upsert({
                product_code: code,
                sucursal_id,
                quantity: newQuantity,
                updated_at: new Date()
            }, { onConflict: 'product_code, sucursal_id' });

        if (error) throw error;

        if (isDeposito) {
            await supabase
                .from('products')
                .update({ current_stock: newQuantity })
                .eq('code', code);
        }

        res.json({ message: 'Stock updated', newQuantity });
    } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).json({ message: 'Error updating stock' });
    }
};

exports.getStockMatrix = async (req, res) => {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (page - 1) * limit;

    try {
        // 1. Get Branches to build columns
        const { data: branches, error: branchError } = await supabase
            .from('sucursales')
            .select('id, name')
            .order('name');

        if (branchError) throw branchError;

        // 2. Fetch Products (Paginated & Filtered)
        let query = supabase
            .from('products')
            .select('code, description, current_stock', { count: 'exact' });

        if (search) {
            query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`);
        }

        const { data: products, count, error: prodError } = await query
            .range(offset, offset + Number(limit) - 1)
            .order('code');

        if (prodError) throw prodError;

        if (!products || products.length === 0) {
            return res.json({ data: [], total: 0, branches });
        }

        // 3. Fetch Stock for these products
        const productCodes = products.map(p => p.code);
        const { data: stocks, error: stockError } = await supabase
            .from('stock_sucursal')
            .select('product_code, sucursal_id, quantity')
            .in('product_code', productCodes);

        if (stockError) throw stockError;

        // 4. Build Matrix
        const matrix = products.map(p => {
            const row = {
                code: p.code,
                description: p.description,
                stocks: {}
            };

            branches.forEach(b => {
                row.stocks[b.id] = 0;
            });

            const depositoBranch = branches.find(b => b.name === 'Deposito');

            stocks.filter(s => s.product_code === p.code).forEach(s => {
                row.stocks[s.sucursal_id] = s.quantity;
            });

            if (depositoBranch && row.stocks[depositoBranch.id] === 0 && p.current_stock > 0) {
                row.stocks[depositoBranch.id] = p.current_stock;
            }

            return row;
        });

        res.json({
            data: matrix,
            total: count,
            branches
        });

    } catch (error) {
        console.error('Error fetching stock matrix:', error);
        res.status(500).json({ message: 'Error fetching stock matrix' });
    }
};
