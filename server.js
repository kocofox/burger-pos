require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const db = require('./models');
const { Op } = require('sequelize');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON y servir archivos estáticos
app.use(express.json());
app.use(express.static(__dirname));

// Middleware para deshabilitar la caché en todas las rutas de la API
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// =================================================================
// --- API ROUTES ---
// =================================================================

// --- Menu & Public Data ---
// Obtener el menú
app.get('/api/menu', async (req, res) => {
    try {
        const products = await db.Product.findAll({
            include: [{ model: db.Category, as: 'category' }],
            order: [
                [{ model: db.Category, as: 'category' }, 'display_order', 'ASC'],
                ['name', 'ASC']
            ]
        });

        const recipes = await db.ProductIngredient.findAll({
            include: [{ model: db.Ingredient, as: 'ingredient' }]
        });

        // 3. Calcular el stock dinámico para productos compuestos
        const productsWithCalculatedStock = products.map(product => {
            const productJSON = product.toJSON();
            if (product.stock_type === 'COMPOUND') {
                const productRecipe = recipes.filter(r => r.product_id === productJSON.id);
                if (productRecipe.length === 0) {
                    productJSON.stock = 0; // Si no tiene receta, no se puede preparar
                } else {
                    const possibleStock = productRecipe.map(ing => Math.floor(ing.ingredient.stock / ing.quantity_required));
                    productJSON.stock = Math.min(...possibleStock);
                }
            }
            return productJSON;
        });

        // Aplanar la respuesta para que el frontend no tenga que lidiar con objetos anidados
        const flatProducts = productsWithCalculatedStock.map(product => {
            product.is_customizable = product.category.is_customizable; // Preservar el campo is_customizable
            product.category = product.category.name; // Reemplazar el objeto categoría por su nombre
            return product;
        });

        res.json(flatProducts);
    } catch (error) {
        console.error("Error al leer el menú:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Admin Management: Ingredients (CRUD) ---
app.get('/api/ingredients', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const ingredients = await db.Ingredient.findAll({ order: [['name', 'ASC']] });
        res.json(ingredients);
    } catch (error) {
        console.error("Error al leer los insumos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.post('/api/ingredients', verifyToken, checkRole(['admin']), async (req, res) => {
    const { name, stock } = req.body;
    if (!name || stock === undefined) {
        return res.status(400).json({ message: 'Nombre y stock son requeridos.' });
    }
    try {
        await db.Ingredient.create({ name, stock });
        res.status(201).json({ message: 'Insumo creado exitosamente.' });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Ya existe un insumo con ese nombre.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/ingredients/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { name, stock } = req.body;
    if (!name || stock === undefined) {
        return res.status(400).json({ message: 'Nombre y stock son requeridos.' });
    }
    try {
        const [affectedRows] = await db.Ingredient.update({ name, stock }, { where: { id } });
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Insumo no encontrado.' });
        }
        res.status(200).json({ message: 'Insumo actualizado.' });
    } catch (error) {
        console.error("Error al actualizar insumo:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Ya existe otro insumo con ese nombre.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

app.delete('/api/ingredients/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const affectedRows = await db.Ingredient.destroy({ where: { id } });
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Insumo no encontrado.' });
        }
        res.status(200).json({ message: 'Insumo eliminado exitosamente.' });
    } catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({ message: 'No se puede eliminar el insumo porque está siendo usado en una o más recetas.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

// --- Public Data ---
// Obtener las cremas
app.get('/api/sauces', async (req, res) => {
    try {
        const sauces = await db.Sauce.findAll({ order: [['name', 'ASC']] });
        res.json(sauces); // Devolvemos el objeto completo para la gestión
    } catch (error) {
        console.error("Error al leer las cremas:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.post('/api/sauces', verifyToken, checkRole(['admin']), async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'El nombre es requerido.' });
    }
    try {
        await db.Sauce.create({ name });
        res.status(201).json({ message: 'Crema creada exitosamente.' });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Ya existe una crema con ese nombre.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/sauces/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const [affectedRows] = await db.Sauce.update({ name }, { where: { id } });
        if (affectedRows === 0) return res.status(404).json({ message: 'Crema no encontrada.' });
        res.status(200).json({ message: 'Crema actualizada.' });
    } catch (error) {
        res.status(500).send('Error interno del servidor');
    }
});

app.delete('/api/sauces/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const affectedRows = await db.Sauce.destroy({ where: { id } });
        if (affectedRows === 0) return res.status(404).json({ message: 'Crema no encontrada.' });
        res.status(200).json({ message: 'Crema eliminada.' });
    } catch (error) {
        res.status(500).send('Error interno del servidor');
    }
});

// Obtener métodos de pago
app.get('/api/payment-methods', async (req, res) => {
    try {
        const methods = await db.PaymentMethod.findAll({ order: [['id', 'ASC']] });
        res.json(methods.map(m => m.name));
    } catch (error) {
        console.error("Error al leer los métodos de pago:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Obtener el orden de las categorías
app.get('/api/categories/ordered', async (req, res) => {
    try {
        const categories = await db.Category.findAll({ order: [['display_order', 'ASC'], ['name', 'ASC']] });
        res.json(categories);
    } catch (error) {
        console.error("Error al leer las categorías ordenadas:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Admin Management: Categories ---
app.get('/api/categories', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const categories = await db.Category.findAll({ order: [['display_order', 'ASC'], ['name', 'ASC']] });
        res.json(categories);
    } catch (error) {
        console.error("Error al leer las categorías:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Orders ---
// Recibir un nuevo pedido
app.post('/api/orders', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { customerName, items, total, paymentMethod, notes } = req.body;
    const userId = req.user.id;
    const t = await db.sequelize.transaction();
    try {

        // VERIFICACIÓN DE CIERRE DE DÍA
        const today = new Date().toISOString().split('T')[0];
        const closureStatus = await db.DailyClosure.findByPk(today);

        if (closureStatus && closureStatus.status === 'closed') {
            // Si el día está cerrado, se rechaza el pedido con un error claro.
            return res.status(403).json({ message: 'El día ya ha sido cerrado. No se pueden registrar nuevos pedidos.' });
        }

        // 1. Obtener información de stock y recetas
        const productIds = items.map(item => item.productId);
        if (productIds.length === 0) {
            return res.status(400).json({ message: 'El carrito está vacío.' });
        }
        const productsInCart = await db.Product.findAll({ where: { id: productIds }, transaction: t, lock: true });
        const recipes = await db.ProductIngredient.findAll({ where: { product_id: productIds }, transaction: t });

        const ingredientIds = [...new Set(recipes.map(r => r.ingredient_id))];
        let ingredientsInCart = [];
        if (ingredientIds.length > 0) {
            ingredientsInCart = await db.Ingredient.findAll({ where: { id: ingredientIds }, transaction: t, lock: true });
        }

        // 2. Verificar stock y preparar actualizaciones
        const stockUpdates = [];
        for (const item of items) {
            const product = productsInCart.find(p => p.id === item.productId);
            if (!product) throw new Error(`Producto con ID ${item.productId} no encontrado.`);

            if (product.stock_type === 'SIMPLE') {
                if (product.stock < item.quantity) {
                    await t.rollback();
                    return res.status(400).json({ message: `Stock insuficiente para ${product.name}. Solo quedan ${product.stock}.` });
                }
                stockUpdates.push(product.decrement('stock', { by: item.quantity, transaction: t }));
            } else { // COMPOUND
                const productRecipe = recipes.filter(r => r.product_id === product.id);
                if (productRecipe.length === 0) {
                    await t.rollback();
                    return res.status(400).json({ message: `El producto ${product.name} no tiene una receta definida y no se puede vender.` });
                }
                for (const recipeItem of productRecipe) {
                    const ingredient = ingredientsInCart.find(i => i.id === recipeItem.ingredient_id);
                    const requiredQuantity = recipeItem.quantity_required * item.quantity;
                    if (!ingredient || ingredient.stock < requiredQuantity) {
                        await t.rollback();
                        const ingredientName = ingredient ? ingredient.name : `Ingrediente ID ${recipeItem.ingredient_id}`;
                        const availableStock = ingredient ? ingredient.stock : 0;
                        return res.status(400).json({ message: `Stock insuficiente del insumo '${ingredientName}' para preparar ${item.quantity}x ${product.name}. Se necesitan ${requiredQuantity}, solo hay ${availableStock}.` });
                    }
                    stockUpdates.push(ingredient.decrement('stock', { by: requiredQuantity, transaction: t }));
                }
            }
        }

        // 3. Insertar el pedido
        const order = await db.Order.create({
            customer_name: customerName,
            total,
            payment_method: paymentMethod,
            user_id: userId,
            notes
        }, { transaction: t });

        // 4. Insertar items y actualizar stock
        const orderItemsData = items.map(item => ({ ...item, order_id: order.id, product_id: item.productId, price_at_time: item.price, sauces: JSON.stringify(item.sauces || []) }));
        await db.OrderItem.bulkCreate(orderItemsData, { transaction: t });
        await Promise.all(stockUpdates);

        await t.commit();

        // Preparamos el objeto para enviarlo a la cocina
        const orderForKitchen = {
            ...req.body,
            id: order.id,
            customer_name: customerName, // Estandarizamos a snake_case como en la DB
            timestamp: new Date().toISOString() // Usamos la hora del servidor para mayor precisión
        };

        io.emit('new_order', orderForKitchen);
        res.status(201).json({ message: 'Pedido recibido', orderId: order.id });

    } catch (error) {
        await t.rollback();
        console.error("Error al guardar el pedido:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Get all pending orders for the kitchen
app.get('/api/orders/pending', verifyToken, checkRole(['admin', 'kitchen']), async (req, res) => {
    try {
        const pendingOrders = await db.Order.findAll({
            where: { status: 'pending' },
            include: [{
                model: db.OrderItem,
                as: 'orderItems',
                include: [{ model: db.Product, as: 'product' }]
            }],
            order: [['timestamp', 'ASC']]
        });

        const ordersWithItems = pendingOrders.map(order => {
            const items = order.orderItems.map(item => ({
                name: item.product.name,
                quantity: item.quantity,
                sauces: JSON.parse(item.sauces || '[]')
            }));
            return { ...order.toJSON(), items };
        });

        res.json(ordersWithItems);

    } catch (error) {
        console.error("Error al obtener órdenes pendientes:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Dashboard & Reports ---
function buildReportWhereClause(user, date, tableAlias = '') {
    const { role, id: userId } = user;

    const whereClause = {};

    if (date) {
        whereClause.timestamp = { [Op.between]: [`${date} 00:00:00`, `${date} 23:59:59`] };
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        whereClause.timestamp = { [Op.gte]: today };
    }

    if (role === 'cashier') {
        whereClause.user_id = userId;
    }

    return { where: whereClause };
}

// Obtener datos para el dashboard (ventas y pedidos del día)
app.get('/api/dashboard/data', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { date } = req.query;
    try {
        const whereClause = buildReportWhereClause(req.user, date).where;

        const totalSales = await db.Order.sum('total', { where: whereClause });

        const todaysOrders = await db.Order.findAll({
            where: whereClause,
            order: [['timestamp', 'DESC']]
        });

        res.json({
            totalSales: totalSales || 0,
            orders: todaysOrders
        });
    } catch (error) {
        console.error("Error al obtener datos del dashboard:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.get('/api/dashboard/product-report', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { date } = req.query;
    try {
        const whereClause = buildReportWhereClause(req.user, date).where;

        const report = await db.OrderItem.findAll({
            attributes: [
                [db.sequelize.col('product.name'), 'name'], // Incluir el nombre del producto directamente
                [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_sold'],
                [db.sequelize.fn('SUM', db.sequelize.literal('quantity * price_at_time')), 'total_revenue']
            ],
            include: [
                { model: db.Product, as: 'product', attributes: [] }, // Ya no necesitamos traer el objeto anidado
                { model: db.Order, as: 'order', attributes: [], where: whereClause }
            ],
            group: ['product.id'],
            order: [[db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'DESC']]
        });
        res.json(report);
    } catch (error) {
        console.error("Error al generar reporte de productos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Obtener reporte por método de pago
app.get('/api/dashboard/payment-report', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { date } = req.query;
    try {
        const whereClause = buildReportWhereClause(req.user, date).where;
        whereClause.payment_method = { [Op.ne]: null };

        const report = await db.Order.findAll({
            attributes: ['payment_method',
                [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'transaction_count'],
                [db.sequelize.fn('SUM', db.sequelize.col('total')), 'total_revenue']
            ],
            where: whereClause,
            group: ['payment_method'],
            order: [[db.sequelize.fn('SUM', db.sequelize.col('total')), 'DESC']]
        });
        res.json(report);
    } catch (error) {
        console.error("Error al generar reporte de pagos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Get closure status for a given date
app.get('/api/reports/status', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    try {
        const closure = await db.DailyClosure.findByPk(targetDate);
        if (closure) {
            res.json({ status: closure.status });
        } else {
            res.json({ status: 'open' }); // Default to open if no record exists
        }
    } catch (error) {
        console.error("Error fetching closure status:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Propose day closure (for cashiers and admins)
app.post('/api/reports/propose-closure', verifyToken, checkRole(['cashier', 'admin']), async (req, res) => {
    const { id: userId } = req.user;
    const today = new Date().toISOString().split('T')[0];

    try {
        const [closure, created] = await db.DailyClosure.findOrCreate({
            where: { closure_date: today },
            defaults: { status: 'pending_closure', proposed_by_user_id: userId, proposed_at: new Date() }
        });
        if (!created && closure.status === 'open') {
            await closure.update({ status: 'pending_closure', proposed_by_user_id: userId, proposed_at: new Date() });
        }
        res.status(200).json({ message: 'Propuesta de cierre enviada.' });
    } catch (error) {
        console.error("Error al proponer cierre:", error);
        res.status(500).send('Error interno del servidor');
    }
});

async function getReportData(date) {
    const targetDateStr = date || new Date().toISOString().split('T')[0];
    const where = { timestamp: { [Op.between]: [`${targetDateStr} 00:00:00`, `${targetDateStr} 23:59:59`] } };

    const totalSales = await db.Order.sum('total', { where }) || 0;
    const productReport = await db.OrderItem.findAll({
        attributes: [[db.sequelize.col('product.name'), 'name'], [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_sold'], [db.sequelize.fn('SUM', db.sequelize.literal('quantity * price_at_time')), 'total_revenue']],
        include: [{ model: db.Product, as: 'product', attributes: [] }, { model: db.Order, as: 'order', attributes: [], where }],
        group: ['product.id', 'product.name'], order: [[db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'DESC']]
    });
    const paymentReport = await db.Order.findAll({
        attributes: ['payment_method', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'transaction_count'], [db.sequelize.fn('SUM', db.sequelize.col('total')), 'total_revenue']],
        where: { ...where, payment_method: { [Op.ne]: null } }, group: ['payment_method'], order: [[db.sequelize.fn('SUM', db.sequelize.col('total')), 'DESC']]
    });
    return { totalSales, productReport, paymentReport, targetDateStr };
}

function generatePdfReport(res, data, user) {
    const { totalSales, productReport, paymentReport, targetDateStr } = data;
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    const formattedDate = new Date(targetDateStr + 'T12:00:00').toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });
    const filename = `Reporte-Ventas-${new Date(targetDateStr).toLocaleDateString('es-PE').replace(/\//g, '-')}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    // --- Header ---
    doc.fillColor('#444444')
        .fontSize(20).font('Helvetica-Bold').text('Cangre Burger', 40, 45)
        .fontSize(10).font('Helvetica').text('Reporte de Ventas', 200, 50, { align: 'right' })
        .text(`Fecha: ${formattedDate}`, 200, 65, { align: 'right' })
        .moveDown();
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(40, 90).lineTo(555, 90).stroke();

    doc.y = 110; // Start position for content

    // --- Summary Section ---
    doc.fontSize(16).fillColor('black').font('Helvetica-Bold').text('Resumen General', { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(12);
    doc.text(`Ingresos Totales: S/. ${totalSales.toFixed(2)}`);
    if (productReport.length > 0) {
        doc.text(`Producto Más Vendido: ${productReport[0].name} (${productReport[0].total_sold} unidades)`);
    } else {
        doc.text('No se vendieron productos en esta fecha.');
    }
    doc.moveDown(2);

    // --- Product Sales Table ---
    doc.fontSize(16).font('Helvetica-Bold').text('Ventas por Producto', { underline: true });
    doc.moveDown();

    const productTableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Producto', 50, productTableTop);
    doc.text('Cant.', 300, productTableTop, { width: 50, align: 'right' });
    doc.text('P. Unit.', 370, productTableTop, { width: 70, align: 'right' });
    doc.text('Subtotal', 460, productTableTop, { width: 80, align: 'right' });
    doc.moveDown(0.5);
    doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();

    doc.font('Helvetica').fontSize(9);
    productReport.forEach(item => {
        doc.moveDown(0.5);
        const y = doc.y;
        const pricePerUnit = item.total_sold > 0 ? item.total_revenue / item.total_sold : 0;
        doc.text(item.name, 50, y, { width: 250 });
        doc.text(item.total_sold, 300, y, { width: 50, align: 'right' });
        doc.text(`S/. ${pricePerUnit.toFixed(2)}`, 370, y, { width: 70, align: 'right' });
        doc.text(`S/. ${parseFloat(item.total_revenue).toFixed(2)}`, 460, y, { width: 80, align: 'right' });
    });

    doc.moveDown(0.5);
    doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    const totalProducts = productReport.reduce((sum, item) => sum + parseInt(item.total_sold), 0);
    const totalProductRevenue = productReport.reduce((sum, item) => sum + parseFloat(item.total_revenue), 0);
    doc.text('TOTAL', 50, doc.y);
    doc.text(totalProducts, 300, doc.y, { width: 50, align: 'right' });
    doc.text(`S/. ${totalProductRevenue.toFixed(2)}`, 460, doc.y, { width: 80, align: 'right' });
    doc.moveDown(2);

    // --- Payment Method Table ---
    doc.fontSize(16).font('Helvetica-Bold').text('Ventas por Método de Pago', { underline: true });
    doc.moveDown();

    const paymentTableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Método de Pago', 50, paymentTableTop);
    doc.text('Nº Trans.', 370, paymentTableTop, { width: 70, align: 'right' });
    doc.text('Total', 460, paymentTableTop, { width: 80, align: 'right' });
    doc.moveDown(0.5);
    doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();

    doc.font('Helvetica').fontSize(9);
    paymentReport.forEach(item => {
        doc.moveDown(0.5);
        const y = doc.y;
        doc.text(item.payment_method, 50, y);
        doc.text(item.transaction_count, 370, y, { width: 70, align: 'right' });
        doc.text(`S/. ${parseFloat(item.total_revenue).toFixed(2)}`, 460, y, { width: 80, align: 'right' });
    });

    doc.moveDown(0.5);
    doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    const totalTransactions = paymentReport.reduce((sum, item) => sum + item.transaction_count, 0);
    const totalPaymentRevenue = paymentReport.reduce((sum, item) => sum + parseFloat(item.total_revenue), 0);
    doc.text('TOTAL', 50, doc.y);
    doc.text(totalTransactions, 370, doc.y, { width: 70, align: 'right' });
    doc.text(`S/. ${totalPaymentRevenue.toFixed(2)}`, 460, doc.y, { width: 80, align: 'right' });

    // --- Footer ---
    doc.fontSize(8).fillColor('gray')
        .text(`Reporte generado por: ${user.username} el ${new Date().toLocaleString('es-PE')}`, 40, 780, { align: 'left', lineBreak: false })
        .text(`Página 1 de 1`, 40, 780, { align: 'right' });

    doc.end();
}

// Approve closure and generate PDF report (for admins)
app.post('/api/reports/approve-closure', verifyToken, checkRole(['admin']), async (req, res) => {
    const { date } = req.body;
    const { id: adminId } = req.user;

    const targetDateStr = date || new Date().toISOString().split('T')[0];

    try {
        await db.DailyClosure.upsert({
            closure_date: targetDateStr,
            status: 'closed',
            closed_by_user_id: adminId,
            closed_at: new Date()
        });

        const reportData = await getReportData(date);
        generatePdfReport(res, reportData, req.user);

    } catch (error) {
        console.error("Error al aprobar cierre y generar reporte:", error);
        res.status(500).send('Error interno al generar el reporte');
    }
});

// Regenerate PDF report without changing status
app.post('/api/reports/regenerate', verifyToken, checkRole(['admin']), async (req, res) => {
    const { date } = req.body;
    try {
        // NOTE: This endpoint does not change the closure status, it only generates the report.
        const reportData = await getReportData(date);
        generatePdfReport(res, reportData, req.user);

    } catch (error) {
        console.error("Error al regenerar el reporte PDF:", error);
        res.status(500).send('Error interno al regenerar el reporte');
    }
});

// --- Rutas para Gestión de Productos (Admin) ---

app.post('/api/products', verifyToken, checkRole(['admin']), async (req, res) => {
    const { name, price, category_id, stock, stock_type } = req.body;
    try {
        await db.Product.create({ name, price, category_id, stock, stock_type });
        res.status(201).json({ message: 'Producto creado exitosamente.'});
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({ message: 'Error interno al crear el producto.', error: error.message });
    }
});

app.put('/api/products/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { name, price, category_id, stock, stock_type } = req.body;
    try {
        const [affectedRows] = await db.Product.update({ name, price, category_id, stock, stock_type }, { where: { id } });
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        res.status(200).json({ message: 'Producto actualizado exitosamente.' });
    } catch (error) {
        console.error('Error al actualizar producto:', error);
        res.status(500).json({ message: 'Error interno al actualizar el producto.', error: error.message });
    }
});

app.delete('/api/products/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const affectedRows = await db.Product.destroy({ where: { id } });
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        res.status(200).json({ message: 'Producto eliminado exitosamente.' });
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        res.status(500).json({ message: 'Error al eliminar producto. Es posible que esté asociado a pedidos existentes.', error: error.message });
    }
});

// --- Admin Management: Recipes ---
app.get('/api/products/compound', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const products = await db.Product.findAll({ where: { stock_type: 'COMPOUND' }, order: [['name', 'ASC']] });
        res.json(products);
    } catch (error) {
        console.error("Error al leer productos compuestos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.get('/api/recipes/:productId', verifyToken, checkRole(['admin']), async (req, res) => {
    const { productId } = req.params;
    try {
        const recipe = await db.ProductIngredient.findAll({
            where: { product_id: productId },
            include: [{ model: db.Ingredient, as: 'ingredient', attributes: ['id', 'name'] }]
        });
        res.json(recipe);
    } catch (error) {
        console.error("Error al leer la receta:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/recipes/:productId', verifyToken, checkRole(['admin']), async (req, res) => {
    const { productId } = req.params;
    const { ingredients } = req.body; // ingredients es un array de { ingredient_id, quantity_required }
    const t = await db.sequelize.transaction();
    try {
        await db.ProductIngredient.destroy({ where: { product_id: productId }, transaction: t });
        if (ingredients && ingredients.length > 0) {
            const recipeData = ingredients.map(ing => ({ ...ing, product_id: productId }));
            await db.ProductIngredient.bulkCreate(recipeData, { transaction: t });
        }
        await t.commit();
        res.json({ message: 'Receta actualizada exitosamente.' });
    } catch (error) {
        await t.rollback();
        console.error("Error al actualizar la receta:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.get('/api/dashboard/ingredient-stock-report', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const ingredients = await db.Ingredient.findAll({
            attributes: ['name', 'stock'],
            order: [['name', 'ASC']]
        });
        res.json(ingredients);
    } catch (error) {
        console.error("Error al leer el reporte de stock de insumos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Authentication ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await db.User.findOne({
            where: { username },
            include: [{ model: db.Role, as: 'role' }]
        });

        if (!user) {
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role.name },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ message: 'Login exitoso', token, role: user.role.name });

    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// --- User Profile Management ---
app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'Token inválido o no proporcionado.' });
        }
        const user = await db.User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'full_name', 'phone_number']
        });
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        res.json(user);
    } catch (error) {
        console.error("Error al obtener el perfil:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/profile', verifyToken, async (req, res) => {
    const { full_name, phone_number } = req.body;
    try {
        const [affectedRows] = await db.User.update(
            { full_name, phone_number },
            { where: { id: req.user.id } }
        );
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        res.json({ message: 'Perfil actualizado exitosamente.' });
    } catch (error) {
        console.error("Error al actualizar el perfil:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/profile/change-password', verifyToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    try {
        const user = await db.User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });
        }

        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash(newPassword, salt);
        await user.update({ password_hash: newPasswordHash });

        res.json({ message: 'Contraseña actualizada exitosamente.' });
    } catch (error) {
        console.error("Error al cambiar la contraseña:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// =================================================================
// --- PAGE SERVING ROUTES ---
// =================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'burger.html'));
});

app.get('/kitchen', (req, res) => {
    res.sendFile(path.join(__dirname, 'kitchen.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/manage-products.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'manage-products.html'));
});

app.get('/manage-ingredients.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'manage-ingredients.html'));
});

app.get('/manage-recipes.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'manage-recipes.html'));
});

app.get('/manage-sauces.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'manage-sauces.html'));
});

app.get('/profile.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// =================================================================
// --- MIDDLEWARE, SOCKETS, SERVER START ---
// =================================================================
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearerToken = bearerHeader.split(' ')[1];
        jwt.verify(bearerToken, process.env.JWT_SECRET, (err, authData) => {
            if (err) {
                return res.sendStatus(403); // Token inválido
            }
            req.user = authData;
            next();
        });
    } else {
        res.sendStatus(401); // No autorizado
    }
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).send('Acceso denegado. No tienes el rol requerido.');
        }
        next();
    };
}

// --- Socket.IO Authentication and Connection ---

// Middleware de autenticación para Socket.IO
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Authentication error: Token no proporcionado.'));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return next(new Error('Authentication error: Token inválido.'));
        }

        // Verificar que el rol sea el adecuado para la cocina
        if (user.role !== 'kitchen' && user.role !== 'admin') {
            return next(new Error('Authentication error: Permisos insuficientes.'));
        }

        socket.user = user; // Adjuntar la información del usuario al socket
        next();
    });
});

io.on('connection', (socket) => {
    console.log(`Un dispositivo se ha conectado: ${socket.user.username} (${socket.user.role})`);

    socket.on('mark_order_ready', async (orderId) => {
        try {
            // La acción está autenticada por el middleware del socket
            await db.Order.update({ status: 'completed' }, { where: { id: orderId } });
            io.emit('remove_order', orderId); // Notificar a todos los clientes para que eliminen la tarjeta
        } catch (error) {
            console.error(`Error al marcar la orden ${orderId} como lista:`, error);
        }
    });

    // Opcional: Manejar la desconexión
    socket.on('disconnect', () => {
        console.log(`Dispositivo desconectado: ${socket.user.username}`);
    });
});

db.sequelize.sync()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
            console.log(`Login: http://localhost:${PORT}/login.html`);
        });
    }).catch(err => {
        console.error('No se pudo conectar a la base de datos:', err);
    });
