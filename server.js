require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Configuración de la Base de Datos ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware para parsear JSON y servir archivos estáticos
app.use(express.json());
app.use(express.static(__dirname));

// =================================================================
// --- API ROUTES ---
// =================================================================

// --- Menu & Public Data ---
// Obtener el menú
app.get('/api/menu', async (req, res) => {
    try {
        // 1. Obtener todos los productos
        const [products] = await pool.query(
            `SELECT p.id, p.name, p.price, p.stock, p.stock_type, c.name as category, c.is_customizable, p.category_id
             FROM products p JOIN categories c ON p.category_id = c.id
             ORDER BY c.display_order ASC, p.name ASC`
        );

        // 2. Obtener las recetas de los productos compuestos
        const [recipes] = await pool.query(
            `SELECT pi.product_id, i.stock as ingredient_stock, pi.quantity_required 
             FROM product_ingredients pi 
             JOIN ingredients i ON pi.ingredient_id = i.id`
        );

        // 3. Calcular el stock dinámico para productos compuestos
        const productsWithCalculatedStock = products.map(product => {
            if (product.stock_type === 'COMPOUND') {
                const productRecipe = recipes.filter(r => r.product_id === product.id);
                if (productRecipe.length === 0) {
                    product.stock = 0; // Si no tiene receta, no se puede preparar
                } else {
                    // El stock es el mínimo de lo que se puede preparar con cada ingrediente
                    const possibleStock = productRecipe.map(ing => Math.floor(ing.ingredient_stock / ing.quantity_required));
                    product.stock = Math.min(...possibleStock);
                }
            }
            return product;
        });

        res.json(productsWithCalculatedStock);
    } catch (error) {
        console.error("Error al leer el menú:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Admin Management: Ingredients (CRUD) ---
app.get('/api/ingredients', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const [ingredients] = await pool.query('SELECT id, name, stock FROM ingredients ORDER BY name ASC');
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
        await pool.query('INSERT INTO ingredients (name, stock) VALUES (?, ?)', [name, stock]);
        res.status(201).json({ message: 'Insumo creado exitosamente.' });
    } catch (error) {
        console.error("Error al crear insumo:", error);
        if (error.code === 'ER_DUP_ENTRY') {
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
        const [result] = await pool.query('UPDATE ingredients SET name = ?, stock = ? WHERE id = ?', [name, stock, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Insumo no encontrado.' });
        }
        res.status(200).json({ message: 'Insumo actualizado.' });
    } catch (error) {
        console.error("Error al actualizar insumo:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Ya existe otro insumo con ese nombre.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

app.delete('/api/ingredients/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM ingredients WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Insumo no encontrado.' });
        }
        res.status(200).json({ message: 'Insumo eliminado exitosamente.' });
    } catch (error) {
        console.error("Error al eliminar insumo:", error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ message: 'No se puede eliminar el insumo porque está siendo usado en una o más recetas.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

// --- Public Data ---
// Obtener las cremas
app.get('/api/sauces', async (req, res) => {
    try {
        const [sauces] = await pool.query('SELECT name FROM sauces ORDER BY name ASC');
        // Enviamos un array simple de strings, que es lo que el frontend espera
        res.json(sauces.map(s => s.name));
    } catch (error) {
        console.error("Error al leer las cremas:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Obtener métodos de pago
app.get('/api/payment-methods', async (req, res) => {
    try {
        const [methods] = await pool.query('SELECT name FROM payment_methods ORDER BY id ASC');
        res.json(methods.map(m => m.name));
    } catch (error) {
        console.error("Error al leer los métodos de pago:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Obtener el orden de las categorías
app.get('/api/categories/ordered', async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT name, display_name FROM categories ORDER BY display_order ASC, name ASC');
        res.json(categories);
    } catch (error) {
        console.error("Error al leer las categorías ordenadas:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Admin Management: Categories ---
app.get('/api/categories', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT id, name, display_name FROM categories ORDER BY display_order ASC, name ASC');
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
    const connection = await pool.getConnection();
    try {
        // VERIFICACIÓN DE CIERRE DE DÍA
        const today = new Date().toISOString().split('T')[0];
        const [closureStatus] = await connection.query(
            'SELECT status FROM daily_closures WHERE closure_date = ?',
            [today]
        );

        if (closureStatus.length > 0 && closureStatus[0].status === 'closed') {
            // Si el día está cerrado, se rechaza el pedido con un error claro.
            return res.status(403).json({ message: 'El día ya ha sido cerrado. No se pueden registrar nuevos pedidos.' });
        }

        await connection.beginTransaction();

        // 1. Obtener información de stock y recetas para los productos del pedido y bloquear las filas para la transacción
        const productIds = items.map(item => item.productId);
        if (productIds.length === 0) {
            return res.status(400).json({ message: 'El carrito está vacío.' });
        }
        const [productsInCart] = await connection.query('SELECT id, name, stock, stock_type FROM products WHERE id IN (?) FOR UPDATE', [productIds]);
        const [recipes] = await connection.query('SELECT * FROM product_ingredients WHERE product_id IN (?)', [productIds]);
        
        const ingredientIds = [...new Set(recipes.map(r => r.ingredient_id))];
        let ingredientsInCart = [];
        if (ingredientIds.length > 0) {
            [ingredientsInCart] = await connection.query('SELECT id, name, stock FROM ingredients WHERE id IN (?) FOR UPDATE', [ingredientIds]);
        }

        // 2. Verificar stock y preparar actualizaciones
        const stockUpdates = [];
        for (const item of items) {
            const product = productsInCart.find(p => p.id === item.productId);
            if (!product) throw new Error(`Producto con ID ${item.productId} no encontrado.`);

            if (product.stock_type === 'SIMPLE') {
                if (product.stock < item.quantity) {
                    await connection.rollback();
                    return res.status(400).json({ message: `Stock insuficiente para ${product.name}. Solo quedan ${product.stock}.` });
                }
                stockUpdates.push(connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, product.id]));
            } else { // COMPOUND
                const productRecipe = recipes.filter(r => r.product_id === product.id);
                if (productRecipe.length === 0) {
                    await connection.rollback();
                    return res.status(400).json({ message: `El producto ${product.name} no tiene una receta definida y no se puede vender.` });
                }
                for (const recipeItem of productRecipe) {
                    const ingredient = ingredientsInCart.find(i => i.id === recipeItem.ingredient_id);
                    const requiredQuantity = recipeItem.quantity_required * item.quantity;
                    if (!ingredient || ingredient.stock < requiredQuantity) {
                        await connection.rollback();
                        const ingredientName = ingredient ? ingredient.name : `Ingrediente ID ${recipeItem.ingredient_id}`;
                        const availableStock = ingredient ? ingredient.stock : 0;
                        return res.status(400).json({ message: `Stock insuficiente del insumo '${ingredientName}' para preparar ${item.quantity}x ${product.name}. Se necesitan ${requiredQuantity}, solo hay ${availableStock}.` });
                    }
                    stockUpdates.push(connection.query('UPDATE ingredients SET stock = stock - ? WHERE id = ?', [recipeItem.quantity_required * item.quantity, recipeItem.ingredient_id]));
                }
            }
        }

        // 3. Si las verificaciones de stock pasaron, insertar el pedido
        const [orderResult] = await connection.query(
            'INSERT INTO orders (customer_name, total, payment_method, user_id, notes) VALUES (?, ?, ?, ?, ?)',
            [customerName, total, paymentMethod, userId, notes]
        );
        const orderId = orderResult.insertId;

        // 4. Insertar los items del pedido en la tabla 'order_items'
        const orderItemsPromises = items.map(item => {
            return connection.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_time, sauces) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.productId, item.quantity, item.price, JSON.stringify(item.sauces || [])]
            );
        });

        // 5. Ejecutar todas las promesas en paralelo (inserción de items y actualización de stock/insumos)
        await Promise.all([
            ...orderItemsPromises,
            ...stockUpdates
        ]);

        await connection.commit();

        // Preparamos el objeto para enviarlo a la cocina
        const orderForKitchen = {
            ...req.body, // Contiene items, notes, etc.
            id: orderId, // Añadimos el ID del pedido recién creado
            customer_name: customerName, // Estandarizamos a snake_case como en la DB
            timestamp: new Date().toISOString() // Usamos la hora del servidor para mayor precisión
        };

        // Enviar el nuevo pedido a la cocina en tiempo real
        io.emit('new_order', orderForKitchen);
        res.status(201).json({ message: 'Pedido recibido', orderId });

    } catch (error) {
        await connection.rollback();
        console.error("Error al guardar el pedido:", error);
        res.status(500).send('Error interno del servidor');
    } finally {
        connection.release();
    }
});

// Get all pending orders for the kitchen
app.get('/api/orders/pending', verifyToken, checkRole(['admin', 'kitchen']), async (req, res) => {
    try {
        // 1. Get all pending orders
        const [pendingOrders] = await pool.query(
            `SELECT id, customer_name, notes, timestamp FROM orders WHERE status = 'pending' ORDER BY timestamp ASC`
        );

        if (pendingOrders.length === 0) {
            return res.json([]);
        }

        const orderIds = pendingOrders.map(o => o.id);

        // 2. Get all items for those orders
        const [orderItems] = await pool.query(
            `SELECT oi.order_id, oi.quantity, oi.sauces, p.name 
             FROM order_items oi 
             JOIN products p ON oi.product_id = p.id 
             WHERE oi.order_id IN (?)`,
            [orderIds]
        );

        // 3. Map items to their orders
        const ordersWithItems = pendingOrders.map(order => {
            const items = orderItems
                .filter(item => item.order_id === order.id)
                .map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    sauces: JSON.parse(item.sauces || '[]') // Sauces are stored as JSON string
                }));
            
            return { ...order, items };
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
    const conditions = [];
    const params = [];
    const timestampField = tableAlias ? `${tableAlias}.timestamp` : 'timestamp';
    const userIdField = tableAlias ? `${tableAlias}.user_id` : 'user_id';

    if (date) {
        // The date from the frontend is already a 'YYYY-MM-DD' string.
        // Using it directly is simpler and avoids potential timezone issues.
        conditions.push(`DATE(${timestampField}) = ?`);
        params.push(date);
    } else {
        conditions.push(`DATE(${timestampField}) = CURDATE()`);
    }

    if (role === 'cashier') {
        conditions.push(`${userIdField} = ?`);
        params.push(userId);
    }

    return {
        clause: `WHERE ${conditions.join(' AND ')}`,
        params: params
    };
}

// Obtener datos para el dashboard (ventas y pedidos del día)
app.get('/api/dashboard/data', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { date } = req.query;
    try {
        const { clause: queryFilter, params: queryParams } = buildReportWhereClause(req.user, date);

        const [salesResult] = await pool.query(
            `SELECT SUM(total) as totalSales FROM orders ${queryFilter}`,
            queryParams
        );
        const [todaysOrders] = await pool.query(
            `SELECT id, customer_name, total, status, timestamp, payment_method FROM orders ${queryFilter} ORDER BY timestamp DESC`,
            queryParams
        );

        res.json({
            totalSales: parseFloat(salesResult[0].totalSales) || 0,
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
        const { clause: queryFilter, params: queryParams } = buildReportWhereClause(req.user, date, 'o');
        const [report] = await pool.query(`
            SELECT 
                p.name, 
                SUM(oi.quantity) as total_sold,
                SUM(oi.quantity * oi.price_at_time) as total_revenue
            FROM order_items oi
            INNER JOIN products p ON oi.product_id = p.id
            INNER JOIN orders o ON oi.order_id = o.id
            ${queryFilter} 
            GROUP BY p.id, p.name
            ORDER BY total_sold DESC;
        `, queryParams);
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
        const { clause: queryFilter, params: queryParams } = buildReportWhereClause(req.user, date, 'o');
        const [report] = await pool.query(`
            SELECT 
                payment_method,
                COUNT(*) as transaction_count,
                SUM(total) as total_revenue
            FROM orders o
            ${queryFilter} AND o.payment_method IS NOT NULL
            GROUP BY o.payment_method
            ORDER BY total_revenue DESC;
        `, queryParams);
        res.json(report);
    } catch (error) {
        console.error("Error al generar reporte de pagos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// Get closure status for a given date
app.get('/api/reports/status', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { date } = req.query;
    const targetDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    try {
        const [rows] = await pool.query('SELECT status FROM daily_closures WHERE closure_date = ?', [targetDate]);
        if (rows.length > 0) {
            res.json({ status: rows[0].status });
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
        // Using INSERT ... ON DUPLICATE KEY UPDATE to handle both creation and update
        await pool.query(`
            INSERT INTO daily_closures (closure_date, status, proposed_by_user_id, proposed_at)
            VALUES (?, 'pending_closure', ?, NOW())
            ON DUPLICATE KEY UPDATE
                status = IF(status = 'open', 'pending_closure', status),
                proposed_by_user_id = IF(status = 'open', ?, proposed_by_user_id),
                proposed_at = IF(status = 'open', NOW(), proposed_at)
        `, [today, userId, userId]);
        res.status(200).json({ message: 'Propuesta de cierre enviada.' });
    } catch (error) {
        console.error("Error al proponer cierre:", error);
        res.status(500).send('Error interno del servidor');
    }
});

async function getReportData(date) {
    // If no date is provided (e.g., an empty string), default to today's date.
    const targetDateStr = date || new Date().toISOString().split('T')[0];
    const queryParams = [targetDateStr];

    // 1. Get Total Sales
    const [salesResult] = await pool.query(`SELECT SUM(total) as totalSales FROM orders WHERE DATE(timestamp) = ?`, queryParams);
    // The SUM function in MySQL can return a string. We parse it to ensure it's a number.
    const totalSales = parseFloat(salesResult[0].totalSales) || 0;

    // 2. Get Product Report
    const [productReport] = await pool.query(`
        SELECT p.name, SUM(oi.quantity) as total_sold, SUM(oi.quantity * oi.price_at_time) as total_revenue
        FROM order_items oi
        INNER JOIN products p ON oi.product_id = p.id
        INNER JOIN orders o ON oi.order_id = o.id
        WHERE DATE(o.timestamp) = ?
        GROUP BY p.id, p.name ORDER BY total_revenue DESC`, queryParams);

    // 3. Get Payment Method Report
    const [paymentReport] = await pool.query(`
        SELECT payment_method, COUNT(*) as transaction_count, SUM(total) as total_revenue
        FROM orders
        WHERE DATE(timestamp) = ? AND payment_method IS NOT NULL
        GROUP BY payment_method ORDER BY total_revenue DESC`, queryParams);

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

    const targetDateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    try {
        // Update closure status to 'closed'
        await pool.query(`
            INSERT INTO daily_closures (closure_date, status, closed_by_user_id, closed_at)
            VALUES (?, 'closed', ?, NOW())
            ON DUPLICATE KEY UPDATE
                status = 'closed',
                closed_by_user_id = ?,
                closed_at = NOW()
        `, [targetDateStr, adminId, adminId]);

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
        await pool.query('INSERT INTO products (name, price, category_id, stock, stock_type) VALUES (?, ?, ?, ?, ?)', [name, price, category_id, stock, stock_type]);
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
        const [result] = await pool.query('UPDATE products SET name = ?, price = ?, category_id = ?, stock = ?, stock_type = ? WHERE id = ?', [name, price, category_id, stock, stock_type, id]);
        if (result.affectedRows === 0) {
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
        const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
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
        const [products] = await pool.query("SELECT id, name FROM products WHERE stock_type = 'COMPOUND' ORDER BY name ASC");
        res.json(products);
    } catch (error) {
        console.error("Error al leer productos compuestos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.get('/api/recipes/:productId', verifyToken, checkRole(['admin']), async (req, res) => {
    const { productId } = req.params;
    try {
        const [recipe] = await pool.query(
            `SELECT i.id as ingredient_id, i.name, pi.quantity_required 
             FROM product_ingredients pi 
             JOIN ingredients i ON pi.ingredient_id = i.id 
             WHERE pi.product_id = ?`,
            [productId]
        );
        res.json(recipe);
    } catch (error) {
        console.error("Error al leer la receta:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/recipes/:productId', verifyToken, checkRole(['admin']), async (req, res) => {
    const { productId } = req.params;
    const { ingredients } = req.body; // ingredients es un array de { ingredient_id, quantity_required }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // Borrar la receta anterior
        await connection.query('DELETE FROM product_ingredients WHERE product_id = ?', [productId]);
        // Insertar la nueva receta si hay ingredientes
        if (ingredients && ingredients.length > 0) {
            const values = ingredients.map(ing => [productId, ing.ingredient_id, ing.quantity_required]);
            await connection.query('INSERT INTO product_ingredients (product_id, ingredient_id, quantity_required) VALUES ?', [values]);
        }
        await connection.commit();
        res.json({ message: 'Receta actualizada exitosamente.' });
    } catch (error) {
        await connection.rollback();
        console.error("Error al actualizar la receta:", error);
        res.status(500).send('Error interno del servidor');
    } finally {
        connection.release();
    }
});

app.get('/api/dashboard/ingredient-stock-report', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const [ingredients] = await pool.query(`
            SELECT name, stock FROM ingredients ORDER BY name ASC
        `);
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
        const [users] = await pool.query(
            `SELECT u.id, u.username, u.password_hash, r.name as role 
             FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ?`,
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ message: 'Login exitoso', token, role: user.role });

    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
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
            // Ahora la acción está autenticada y sabemos quién la realizó (socket.user)
            await pool.query('UPDATE orders SET status = ? WHERE id = ?', ['completed', orderId]);
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

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Login: http://localhost:${PORT}/login.html`);
});
