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

// Establecer la zona horaria para toda la aplicación a GMT-5 (Lima, Perú)
process.env.TZ = 'America/Lima';

const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON y servir archivos estáticos
app.use(express.json());

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
        // Logging mejorado
        console.error("Error detallado en GET /api/menu:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener el menú.' });
    }
});

// --- Admin Management: Ingredients (CRUD) ---
app.get('/api/ingredients', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const ingredients = await db.Ingredient.findAll({ order: [['name', 'ASC']] });
        res.json(ingredients);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/ingredients:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener insumos.' });
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
        // Logging mejorado
        console.error("Error detallado en POST /api/ingredients:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al crear insumo.' });
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
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Ya existe otro insumo con ese nombre.' });
        }
        // Logging mejorado
        console.error(`Error detallado en PUT /api/ingredients/${id}:`, {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al actualizar insumo.' });
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
        // Logging mejorado
        console.error(`Error detallado en DELETE /api/ingredients/${id}:`, {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al eliminar insumo.' });
    }
});

// --- Public Data ---
// Obtener las cremas
app.get('/api/sauces', async (req, res) => {
    try {
        const sauces = await db.Sauce.findAll({ order: [['name', 'ASC']] });
        res.json(sauces); // Devolvemos el objeto completo para la gestión
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/sauces:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener cremas.' });
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
        // Logging mejorado
        console.error("Error detallado en POST /api/sauces:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al crear crema.' });
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
        // Logging mejorado
        console.error(`Error detallado en PUT /api/sauces/${id}:`, {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al actualizar crema.' });
    }
});

app.delete('/api/sauces/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const affectedRows = await db.Sauce.destroy({ where: { id } });
        if (affectedRows === 0) return res.status(404).json({ message: 'Crema no encontrada.' });
        res.status(200).json({ message: 'Crema eliminada.' });
    } catch (error) {
        // Logging mejorado
        console.error(`Error detallado en DELETE /api/sauces/${id}:`, {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al eliminar crema.' });
    }
});

// Obtener métodos de pago
app.get('/api/payment-methods', async (req, res) => {
    try {
        const methods = await db.PaymentMethod.findAll({ order: [['id', 'ASC']] });
        res.json(methods.map(m => m.name));
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/payment-methods:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener métodos de pago.' });
    }
});

// Obtener el orden de las categorías
app.get('/api/categories/ordered', async (req, res) => {
    try {
        const categories = await db.Category.findAll({ order: [['display_order', 'ASC'], ['name', 'ASC']] });
        res.json(categories);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/categories/ordered:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener categorías.' });
    }
});

// --- Admin Management: Categories ---
app.get('/api/categories', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    try {
        const categories = await db.Category.findAll({ order: [['display_order', 'ASC'], ['name', 'ASC']] });
        res.json(categories);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/categories:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener categorías.' });
    }
});

// --- Customer Management ---
app.get('/api/customers', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { search } = req.query;
    try {
        const customers = await db.Customer.findAll({
            where: {
                full_name: {
                    [Op.like]: `%${search}%`
                }
            },
            limit: 10
        });
        res.json(customers);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/customers:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno del servidor al buscar clientes.' });
    }
});

// --- Orders ---
// Recibir un nuevo pedido
app.post('/api/orders', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    // MODIFICADO: Ahora recibimos customerId o customerName para crear uno nuevo.
    const { customerId, customerName, items, total, paymentMethod, notes } = req.body;
    const userId = req.user.id;
    const t = await db.sequelize.transaction();
    try {

        // VERIFICACIÓN DE CIERRE DE DÍA
        const today = new Date().toLocaleDateString('en-CA'); // Formato YYYY-MM-DD en la zona horaria correcta
        const closureStatus = await db.DailyClosure.findByPk(today);

        if (closureStatus && closureStatus.status === 'closed') {
            // Si el día está cerrado, se rechaza el pedido con un error claro.
            return res.status(403).json({ message: 'El día ya ha sido cerrado. No se pueden registrar nuevos pedidos.' });
        }

        // Lógica para obtener o crear el cliente
        let finalCustomerId;
        if (customerId) {
            finalCustomerId = customerId;
        } else if (customerName) {
            const [customer, created] = await db.Customer.findOrCreate({
                where: { full_name: customerName },
                defaults: { full_name: customerName },
                transaction: t
            });
            finalCustomerId = customer.id;
        } else {
            return res.status(400).json({ message: 'Se requiere un cliente para el pedido.' });
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
        // Un pedido nuevo con items siempre está 'pending' para la cocina.
        // La diferencia entre un pedido para llevar y una cuenta abierta es si 'paymentMethod' es nulo.
        const status = 'pending';
        const order = await db.Order.create({
            customer_id: finalCustomerId, // Usamos el ID del cliente
            customer_name: customerName, // Mantenemos el nombre para acceso rápido si se desea
            total,
            payment_method: paymentMethod,
            status: status,
            notes,
            user_id: userId
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
            customer_name: customerName,
            timestamp: new Date().toISOString() // Usamos la hora del servidor para mayor precisión
        };

        // Solo notificar a la cocina si hay items que preparar (no al solo abrir una cuenta vacía)
        if (items.length > 0) {
            io.emit('new_order', orderForKitchen);
        }
        res.status(201).json({ message: 'Pedido recibido', orderId: order.id });

    } catch (error) {
        await t.rollback();
        // Logging mejorado
        console.error("Error detallado en POST /api/orders:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno del servidor al guardar el pedido.' });
    }
});

// Get all pending orders for the kitchen
app.get('/api/orders/pending', verifyToken, checkRole(['admin', 'kitchen', 'cashier']), async (req, res) => {
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
        // Logging mejorado
        console.error("Error detallado en GET /api/orders/pending:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener órdenes pendientes.' });
    }
});

app.put('/api/orders/:id', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { id } = req.params;
    const { status, payment_method } = req.body;

    try {
        const order = await db.Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ message: 'Pedido no encontrado.' });
        }

        // This route is specifically for paying an account
        if (status === 'paid' && payment_method) {
            await order.update({ status, payment_method });
            res.status(200).json({ message: 'Cuenta pagada exitosamente.' });
        } else {
            return res.status(400).json({ message: 'Actualización no permitida. Use esta ruta solo para pagar cuentas.' });
        }
    } catch (error) {
        // Logging mejorado
        console.error(`Error detallado en PUT /api/orders/${id}:`, {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno del servidor al actualizar el pedido.' });
    }
});

// Anular una orden (Admin)
app.put('/api/orders/:id/cancel', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const t = await db.sequelize.transaction();

    try {
        const order = await db.Order.findByPk(id, {
            include: [{ model: db.OrderItem, as: 'orderItems' }],
            transaction: t
        });

        if (!order) {
            await t.rollback();
            return res.status(404).json({ message: 'Pedido no encontrado.' });
        }

        if (order.status === 'cancelled') {
            await t.rollback();
            return res.status(400).json({ message: 'Este pedido ya ha sido anulado.' });
        }

        // 1. Revertir el stock
        const productIds = order.orderItems.map(item => item.product_id);
        const products = await db.Product.findAll({ where: { id: productIds }, transaction: t, lock: true });
        const recipes = await db.ProductIngredient.findAll({ where: { product_id: productIds }, transaction: t });
        const ingredientIds = [...new Set(recipes.map(r => r.ingredient_id))];
        let ingredients = [];
        if (ingredientIds.length > 0) {
            ingredients = await db.Ingredient.findAll({ where: { id: ingredientIds }, transaction: t, lock: true });
        }

        const stockUpdates = [];
        for (const item of order.orderItems) {
            const product = products.find(p => p.id === item.product_id);
            if (product.stock_type === 'SIMPLE') {
                stockUpdates.push(product.increment('stock', { by: item.quantity, transaction: t }));
            } else { // COMPOUND
                const productRecipe = recipes.filter(r => r.product_id === product.id);
                for (const recipeItem of productRecipe) {
                    const ingredient = ingredients.find(i => i.id === recipeItem.ingredient_id);
                    if (ingredient) {
                        const requiredQuantity = recipeItem.quantity_required * item.quantity;
                        stockUpdates.push(ingredient.increment('stock', { by: requiredQuantity, transaction: t }));
                    }
                }
            }
        }
        await Promise.all(stockUpdates);

        // 2. Actualizar el estado de la orden
        await order.update({ status: 'cancelled' }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: 'Pedido anulado y stock restaurado exitosamente.' });
    } catch (error) {
        await t.rollback();
        // Logging mejorado
        console.error(`Error detallado en PUT /api/orders/${id}/cancel:`, {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al anular el pedido.' });
    }
});

// Get all open accounts (serving status)
app.get('/api/accounts/open', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    try {
        const openAccounts = await db.Order.findAll({
            where: { 
                // Una cuenta abierta es aquella que está 'sirviéndose' o 'pendiente' en cocina.
                status: { [Op.in]: ['serving', 'pending'] } 
            },
            include: [{
                model: db.OrderItem,
                as: 'orderItems',
                include: [{ model: db.Product, as: 'product' }]
            }],
            order: [['timestamp', 'ASC']]
        });
        res.json(openAccounts);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/accounts/open:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener cuentas abiertas.' });
    }
});

// Add items to an existing order (account)
app.post('/api/accounts/:orderId/items', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { orderId } = req.params;
    const { items, notes } = req.body; // items is an array of { productId, name, quantity, price, sauces }

    if (!items || items.length === 0) {
        return res.status(400).json({ message: 'No se proporcionaron items para añadir.' });
    }

    const t = await db.sequelize.transaction();
    try {
        const order = await db.Order.findByPk(orderId, { transaction: t });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ message: 'Cuenta no encontrada.' });
        }

        const orderItemsData = items.map(item => ({
            order_id: orderId,
            product_id: item.productId,
            quantity: item.quantity,
            price_at_time: item.price,
            sauces: JSON.stringify(item.sauces || [])
        }));

        await db.OrderItem.bulkCreate(orderItemsData, { transaction: t });

        // Recalculate total by summing up all items for that order
        const allOrderItems = await db.OrderItem.findAll({ where: { order_id: orderId }, transaction: t });
        const newTotal = allOrderItems.reduce((sum, item) => sum + (item.quantity * parseFloat(item.price_at_time)), 0);

        // Update total and notes, and set status to 'pending' to send it to the kitchen
        await order.update({ total: newTotal, notes: notes, status: 'pending' }, { transaction: t });
        
        await t.commit(); // Commit transaction before sending notification

        // After committing, fetch the full updated order to send to the kitchen as a new order card.
        const updatedOrderForKitchen = await db.Order.findByPk(orderId, {
            include: [{
                model: db.OrderItem,
                as: 'orderItems',
                include: [{ model: db.Product, as: 'product', attributes: ['id', 'name'] }] // Asegurarse de incluir el ID del producto
            }]
        });

        const kitchenNotification = {
            ...updatedOrderForKitchen.toJSON(),
            items: updatedOrderForKitchen.orderItems.map(item => ({
                // Aquí estaba el error: el id del item debe ser el del producto.
                // El objeto 'item' es un OrderItem, por lo que accedemos a 'item.product.id'
                id: item.product.id, 
                name: item.product.name, 
                quantity: item.quantity, 
                sauces: JSON.parse(item.sauces || '[]')
            })),
            is_addition: true, // Flag to indicate this is an addition
            newItemsIds: items.map(item => item.productId) // Array con los IDs de los productos nuevos
        };
        io.emit('new_order', kitchenNotification);

        res.status(200).json({ message: 'Items añadidos y enviados a cocina.' });
    } catch (error) {
        await t.rollback();
        // Logging mejorado
        console.error(`Error detallado en POST /api/accounts/${orderId}/items:`, {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno del servidor al añadir items.' });
    }
});

// --- Dashboard & Reports ---

function getOperationalDayRange(date) {
    const BUSINESS_DAY_CUTOFF_HOUR = 5; // 5 AM
    let startOfDay, endOfDay;

    if (date) {
        // Para fechas específicas, el día operativo comienza a las 5 AM de esa fecha.
        // Esta lógica es más directa y clara.
        startOfDay = new Date(`${date}T05:00:00`);
    } else {
        // Para la fecha actual, determinar el día operativo actual.
        const now = new Date();
        startOfDay = new Date(now);
        startOfDay.setHours(BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
        if (now < startOfDay) {
            // Si es antes de las 5 AM, pertenece al día operativo anterior.
            startOfDay.setDate(startOfDay.getDate() - 1);
        }
    }

    endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setMilliseconds(endOfDay.getMilliseconds() - 1);

    return { start: startOfDay, end: endOfDay };
}
function buildReportWhereClause(user, date, tableAlias = '') {
    const { role, id: userId } = user;
    const whereClause = {};

    // Obtener el rango del día operativo CORRECTAMENTE
    const { start, end } = getOperationalDayRange(date);
    whereClause.timestamp = { [Op.between]: [start, end] };

    // Si el rol es 'cashier', solo puede ver sus propias ventas
    if (role === 'cashier') {
        whereClause.user_id = userId;
    }
    
    return { where: whereClause };
}

// Obtener datos para el dashboard (ventas y pedidos del día)
app.get('/api/dashboard/data', verifyToken, checkRole(['admin', 'cashier', 'kitchen']), async (req, res) => {
    const { date } = req.query;
    try {
        const whereClause = buildReportWhereClause(req.user, date).where;

        // MODIFICACIÓN: Excluir pedidos anulados del cálculo de ventas totales.
        const salesWhereClause = { ...whereClause, status: { [Op.not]: 'cancelled' } };

        // MODIFICACIÓN: Calcular totales por separado para efectivo y otros medios.
        const totalCashSales = await db.Order.sum('total', {
            where: { ...salesWhereClause, payment_method: 'Efectivo' }
        });

        const totalOtherSales = await db.Order.sum('total', {
            where: { ...salesWhereClause, payment_method: { [Op.not]: 'Efectivo', [Op.ne]: null } }
        });

        const totalSales = (totalCashSales || 0) + (totalOtherSales || 0);

        const todaysOrders = await db.Order.findAll({
            where: whereClause,
            include: [{
                model: db.User,
                as: 'user',
                attributes: ['username', 'full_name'] // Traemos solo los datos necesarios
            }],
            order: [['timestamp', 'DESC']],
        });

        res.json({
            totalSales: totalSales || 0,
            orders: todaysOrders,
            totalCashSales: totalCashSales || 0,
            totalOtherSales: totalOtherSales || 0
        });
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/dashboard/data:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener datos del dashboard.' });
    }
});

app.get('/api/dashboard/product-report', verifyToken, checkRole(['admin', 'cashier', 'kitchen']), async (req, res) => {
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
            ], // MODIFICACIÓN: Asegurarse de que los items de pedidos anulados no se cuenten.
            // Sequelize aplicará el 'where' del include de Order, pero para ser explícitos y seguros,
            // nos aseguramos que el estado no sea 'cancelled'.
            where: { '$order.status$': { [Op.not]: 'cancelled' } },
            group: ['product.id'],
            order: [[db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'DESC']]
        });
        res.json(report);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/dashboard/product-report:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno del servidor al generar reporte de productos.' });
    }
});

// Obtener reporte por método de pago
app.get('/api/dashboard/payment-report', verifyToken, checkRole(['admin', 'cashier', 'kitchen']), async (req, res) => {
    const { date } = req.query;
    try {
        const whereClause = buildReportWhereClause(req.user, date).where;
        whereClause.payment_method = { [Op.ne]: null };
        
        // MODIFICACIÓN: Excluir pedidos anulados del reporte de métodos de pago.
        whereClause.status = { [Op.not]: 'cancelled' };

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
        // Logging mejorado
        console.error("Error detallado en GET /api/dashboard/payment-report:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno del servidor al generar reporte de pagos.' });
    }
});

// Get closure status for a given date
app.get('/api/reports/status', verifyToken, checkRole(['admin', 'cashier', 'kitchen']), async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toLocaleDateString('en-CA');

    try {
        const closure = await db.DailyClosure.findByPk(targetDate);
        if (closure) {
            res.json({ status: closure.status });
        } else {
            res.json({ status: 'open' }); // Default to open if no record exists
        }
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/reports/status:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno del servidor al obtener estado de cierre.' });
    }
});

// Propose day closure (for cashiers and admins)
app.post('/api/reports/propose-closure', verifyToken, checkRole(['cashier', 'admin']), async (req, res) => {
    const { id: userId } = req.user;
    const today = new Date().toLocaleDateString('en-CA');

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
        // Logging mejorado
        console.error("Error detallado en POST /api/reports/propose-closure:", {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno del servidor al proponer cierre.' });
    }
});

async function getReportData(date) {
    const targetDateStr = date || new Date().toLocaleDateString('en-CA');
    const { start, end } = getOperationalDayRange(targetDateStr); // Usar la función centralizada

    const where = {
        // Usar el rango del día operativo para consistencia total
        timestamp: { [Op.between]: [start, end] },
        status: { [Op.not]: 'cancelled' }
    };

    const totalSales = await db.Order.sum('total', { where: where }) || 0;
    const productReport = await db.OrderItem.findAll({
        attributes: [[db.sequelize.col('product.name'), 'name'], [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_sold'], [db.sequelize.fn('SUM', db.sequelize.literal('quantity * price_at_time')), 'total_revenue']],
        include: [{
            model: db.Product, as: 'product', attributes: []
        }, {
            // MODIFICACIÓN: El 'where' del include ya contiene el filtro de estado.
            model: db.Order, as: 'order', attributes: [], where: where // Usar la cláusula 'where' corregida
        }],
        group: ['product.id', 'product.name'], order: [[db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'DESC']]
    });
    const paymentReport = await db.Order.findAll({
        attributes: ['payment_method', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'transaction_count'], [db.sequelize.fn('SUM', db.sequelize.col('total')), 'total_revenue']],
        where: {
            ...where, // Usar la cláusula 'where' corregida
            payment_method: { [Op.ne]: null }
        }, group: ['payment_method'], order: [[db.sequelize.fn('SUM', db.sequelize.col('total')), 'DESC']]
    });
    const expensesReport = await db.Expense.findAll({
        where: {
            expense_date: targetDateStr,
            status: 'approved'
        }
    });
    const ingredientsReport = await db.Ingredient.findAll({
        order: [['stock', 'ASC']]
    });
    return { totalSales, productReport, paymentReport, expensesReport, ingredientsReport, targetDateStr };
}

function generatePdfReport(res, data, user) {
    const { totalSales, productReport, paymentReport, expensesReport, ingredientsReport, targetDateStr } = data;
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Usamos la opción timeZone para asegurar la consistencia, haciendo el código más claro.
    const reportDate = new Date(`${targetDateStr}T00:00:00`);
    const formattedDate = reportDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima', year: 'numeric', month: 'long', day: 'numeric' });
    const filename = `Reporte-Ventas-${reportDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }).replace(/\//g, '-')}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    // --- Header ---
    doc.fillColor('#444444')
        .fontSize(20).font('Helvetica-Bold').text('Resumen de Operaciones', { align: 'center' })
        .fontSize(12).font('Helvetica').text(`Cangre Burger - ${formattedDate}`, { align: 'center' })
        .moveDown();
    doc.moveDown();

    // --- Summary Section ---
    const totalExpenses = expensesReport.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    const netProfit = totalSales - totalExpenses;

    const summaryY = doc.y;
    doc.strokeColor('#e5e7eb').lineWidth(1).roundedRect(50, summaryY, 500, 80, 5).stroke();
    
    doc.font('Helvetica').fontSize(11).fillColor('#374151');
    doc.text('(+) Ingresos Brutos (Ventas):', 70, summaryY + 15);
    doc.text('(-) Gastos del Día:', 70, summaryY + 35);
    
    doc.font('Helvetica-Bold');
    doc.text(`S/. ${totalSales.toFixed(2)}`, 350, summaryY + 15, { width: 180, align: 'right' });
    doc.text(`S/. ${totalExpenses.toFixed(2)}`, 350, summaryY + 35, { width: 180, align: 'right' });

    doc.strokeColor('#374151').lineWidth(0.5).moveTo(70, summaryY + 55).lineTo(530, summaryY + 55).stroke();

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('(=) Utilidad Neta:', 70, summaryY + 62);
    doc.text(`S/. ${netProfit.toFixed(2)}`, 350, summaryY + 62, { width: 180, align: 'right' });
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
        const rowY = doc.y;
        const pricePerUnit = parseInt(item.get('total_sold')) > 0 ? parseFloat(item.get('total_revenue')) / parseInt(item.get('total_sold')) : 0;
        doc.text(item.get('name'), 50, rowY, { width: 250 });
        doc.text(item.get('total_sold'), 300, rowY, { width: 50, align: 'right' });
        doc.text(`S/. ${pricePerUnit.toFixed(2)}`, 370, rowY, { width: 70, align: 'right' });
        doc.text(`S/. ${parseFloat(item.get('total_revenue')).toFixed(2)}`, 460, rowY, { width: 80, align: 'right' });
    });

    doc.moveDown(0.5);
    doc.strokeColor("#aaaaaa").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    const totalProducts = productReport.reduce((sum, item) => sum + parseInt(item.dataValues.total_sold), 0);
    const totalProductRevenue = productReport.reduce((sum, item) => sum + parseFloat(item.dataValues.total_revenue), 0);
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
        const rowY = doc.y;
        doc.text(item.get('payment_method'), 50, rowY);
        doc.text(item.get('transaction_count').toString(), 370, rowY, { width: 70, align: 'right' });
        doc.text(`S/. ${parseFloat(item.get('total_revenue')).toFixed(2)}`, 460, rowY, { width: 80, align: 'right' });
    });

    doc.moveDown(0.5);
    doc.strokeColor("#aaaaaa").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    const totalTransactions = paymentReport.reduce((sum, item) => sum + parseInt(item.dataValues.transaction_count), 0);
    const totalPaymentRevenue = paymentReport.reduce((sum, item) => sum + parseFloat(item.dataValues.total_revenue), 0);
    doc.text('TOTAL', 50, doc.y);
    doc.text(totalTransactions, 370, doc.y, { width: 70, align: 'right' });
    doc.text(`S/. ${totalPaymentRevenue.toFixed(2)}`, 460, doc.y, { width: 80, align: 'right' });
    doc.moveDown(2);

    // --- Expenses Table ---
    if (expensesReport.length > 0) {
        doc.fontSize(16).font('Helvetica-Bold').text('Gastos Aprobados del Día', { underline: true });
        doc.moveDown();

        const expensesTableTop = doc.y;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('Descripción', 50, expensesTableTop);
        doc.text('Categoría', 300, expensesTableTop, { width: 140, align: 'right' });
        doc.text('Monto', 460, expensesTableTop, { width: 80, align: 'right' });
        doc.moveDown(0.5);
        doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();

        doc.font('Helvetica').fontSize(9);
        expensesReport.forEach(expense => {
            doc.moveDown(0.5);
            const rowY = doc.y;
            doc.text(expense.description, 50, rowY, { width: 250 });
            doc.text(expense.category || 'N/A', 300, rowY, { width: 140, align: 'right' });
            doc.text(`S/. ${parseFloat(expense.amount).toFixed(2)}`, 460, rowY, { width: 80, align: 'right' });
        });
    }

    // --- Ingredients Stock Table ---
    if (ingredientsReport.length > 0) {
        doc.addPage(); // Add a new page for the stock report to keep things clean
        doc.fontSize(16).font('Helvetica-Bold').text('Estado de Stock de Insumos', 40, 45, { underline: true });
        doc.moveDown();

        const stockTableTop = doc.y;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('Insumo', 50, stockTableTop);
        doc.text('Stock Actual', 460, stockTableTop, { width: 80, align: 'right' });
        doc.moveDown(0.5);
        doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();

        doc.font('Helvetica').fontSize(9);
        ingredientsReport.forEach(ingredient => {
            doc.moveDown(0.5);
            const rowY = doc.y;
            let stockColor = 'black';
            if (ingredient.stock <= 5) {
                stockColor = '#dc2626'; // red-600
            } else if (ingredient.stock <= 10) {
                stockColor = '#f97316'; // orange-500
            }
            
            doc.fillColor(stockColor).text(ingredient.name, 50, rowY, { width: 400 });
            doc.fillColor(stockColor).text(ingredient.stock, 460, rowY, { width: 80, align: 'right' });
        });
    }

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

    const targetDateStr = date || new Date().toLocaleDateString('en-CA');

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
        // Logging mejorado
        console.error("Error detallado en POST /api/reports/approve-closure:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno al generar el reporte.' });
    }
});

// Force closure and generate PDF report (for admins, when no proposal exists)
app.post('/api/reports/force-closure', verifyToken, checkRole(['admin']), async (req, res) => {
    const { date } = req.body;
    const { id: adminId } = req.user;
    const targetDateStr = date || new Date().toLocaleDateString('en-CA');

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
        // Logging mejorado
        console.error("Error detallado en POST /api/reports/force-closure:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno al forzar el cierre.' });
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
        // Logging mejorado
        console.error("Error detallado en POST /api/reports/regenerate:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno al regenerar el reporte.' });
    }
});

// --- Cashier Session Management ---

// Verificar si el cajero ya inició su caja hoy
app.get('/api/cashier-session/status', verifyToken, checkRole(['cashier']), async (req, res) => {
    const { date } = req.query;
    const { id: userId } = req.user;
    const targetDateStr = date || new Date().toLocaleDateString('en-CA');
    const { start, end } = getOperationalDayRange(targetDateStr);

    try {
        const session = await db.CashierSession.findOne({
            where: { user_id: userId, start_time: { [Op.between]: [start, end] } }
        });

        if (session) {
            res.json({ hasStarted: true, startAmount: session.start_amount, status: session.status });
        } else {
            res.json({ hasStarted: false });
        }
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/cashier-session/status:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno del servidor al verificar sesión de caja.' });
    }
});

// Iniciar la caja del cajero
app.post('/api/cashier-session/start', verifyToken, checkRole(['cashier']), async (req, res) => {
    const { id: userId } = req.user;
    const { startAmount } = req.body;

    if (startAmount === undefined || startAmount < 0) {
        return res.status(400).json({ message: 'El monto inicial es requerido y debe ser válido.' });
    }

    try {
        await db.CashierSession.create({
            user_id: userId,
            start_amount: startAmount,
            start_time: new Date()
        });
        res.status(201).json({ message: 'Caja iniciada exitosamente.' });
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en POST /api/cashier-session/start:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno del servidor al iniciar caja.' });
    }
});

// Cerrar la caja del cajero
app.post('/api/cashier-session/close', verifyToken, checkRole(['cashier']), async (req, res) => {
    const { id: userId } = req.user;
    const { countedAmount } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (countedAmount === undefined || countedAmount < 0) {
        return res.status(400).json({ message: 'El monto contado es requerido.' });
    }

    try {
        const session = await db.CashierSession.findOne({
            where: { user_id: userId, start_time: { [Op.gte]: today } }
        });

        if (!session) {
            return res.status(404).json({ message: 'No se encontró una sesión de caja abierta para hoy.' });
        }

        await session.update({
            end_amount: countedAmount,
            // MODIFICACIÓN: Añadir un estado al cierre de caja.
            // Por defecto, un cierre necesita aprobación del admin.
            status: 'pending_approval',
            end_time: new Date()
        });

        res.status(200).json({ message: 'Caja cerrada exitosamente.' });
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en POST /api/cashier-session/close:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno al cerrar la caja.' });
    }
});

// --- Admin Cashier Closure Management ---
app.get('/api/admin/pending-closures', verifyToken, checkRole(['admin']), async (req, res) => {
    const { date } = req.query;
    const targetDateStr = date || new Date().toLocaleDateString('en-CA');
    const { start, end } = getOperationalDayRange(targetDateStr);

    try {
        const pendingSessions = await db.CashierSession.findAll({
            where: {
                start_time: { [Op.between]: [start, end] },
                status: 'pending_approval'
            },
            include: [{ model: db.User, as: 'user', attributes: ['username'] }]
        });
        res.json(pendingSessions);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/admin/pending-closures:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno al obtener cierres pendientes.' });
    }
});

app.put('/api/admin/closures/:sessionId/approve', verifyToken, checkRole(['admin']), async (req, res) => {
    const { sessionId } = req.params;
    try {
        const session = await db.CashierSession.findByPk(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Sesión de caja no encontrada.' });
        }
        if (session.status !== 'pending_approval') {
            return res.status(400).json({ message: 'Este cierre de caja no está pendiente de aprobación.' });
        }

        await session.update({ status: 'approved' });

        res.json({ message: 'Cierre de caja aprobado exitosamente.' });

    } catch (error) {
        // Logging mejorado
        console.error(`Error detallado en PUT /api/admin/closures/${sessionId}/approve:`, {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({ message: 'Error interno al aprobar cierre de caja.' });
    }
});

app.get('/api/admin/closures-history', verifyToken, checkRole(['admin']), async (req, res) => {
    const { startDate, endDate, userId } = req.query;
    try {
        const whereClause = {};
        if (startDate && endDate) {
            // CORRECCIÓN: El rango de fechas debe ser inclusivo para el día final.
            const startRange = getOperationalDayRange(startDate).start;
            const endRange = getOperationalDayRange(endDate).end;
            whereClause.start_time = { [Op.between]: [startRange, endRange] };
        }
        if (userId) {
            whereClause.user_id = userId;
        }

        const sessions = await db.CashierSession.findAll({
            where: whereClause,
            include: [{
                model: db.User,
                as: 'user',
                attributes: ['username']
            }],
            order: [['start_time', 'DESC']]
        });
        res.json(sessions);
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/admin/closures-history:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno al obtener historial de cierres.' });
    }
});
// NUEVO ENDPOINT: Obtener resumen de caja para el modal de cierre
app.get('/api/cashier-session/summary', verifyToken, checkRole(['cashier']), async (req, res) => {
    const { date } = req.query;
    const { id: userId, role } = req.user; // Obtenemos el rol también
    const targetDateStr = date || new Date().toLocaleDateString('en-CA');

    try {
        // 1. Obtener el monto de inicio de caja
        const { start, end } = getOperationalDayRange(targetDateStr);
        const session = await db.CashierSession.findOne({
            // Usar el rango operativo para encontrar la sesión correcta
            where: { user_id: userId, start_time: { [Op.between]: [start, end] } }
        });
        const startAmount = session ? parseFloat(session.start_amount) : 0;

        // 2. Obtener ventas por método de pago del cajero
        const paymentReport = await db.Order.findAll({
            attributes: ['payment_method', [db.sequelize.fn('SUM', db.sequelize.col('total')), 'total_revenue']],
            where: {
                user_id: userId,
                payment_method: { [Op.ne]: null },
                status: { [Op.not]: 'cancelled' },
                timestamp: { [Op.between]: [start, end] } // Usar el rango operativo
            },
            group: ['payment_method']
        });

        // Convertir el reporte a un objeto más fácil de usar y calcular el total de efectivo
        const salesByPaymentMethod = {};
        let totalCash = 0;
        paymentReport.forEach(item => {
            const method = item.get('payment_method');
            const revenue = parseFloat(item.get('total_revenue'));
            salesByPaymentMethod[method] = revenue;
            if (method === 'Efectivo') {
                totalCash = revenue;
            }
        });

        // 3. Obtener gastos registrados por el cajero
        const expenses = await db.Expense.sum('amount', {
            where: {
                user_id: userId,
                expense_date: targetDateStr,
                status: 'approved'
            }
        });
        const totalExpenses = parseFloat(expenses) || 0;

        res.json({
            startAmount,
            salesByPaymentMethod, // Enviamos el desglose completo
            totalCash, // Mantenemos el total de efectivo para el cálculo de caja
            totalExpenses
        });
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/cashier-session/summary:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno al obtener el resumen de caja.' });
    }
});
// Generar reporte PDF solo para el cajero
app.post('/api/reports/cashier-report', verifyToken, checkRole(['cashier']), async (req, res) => {
    const { date } = req.body;
    const { id: userId } = req.user;
    const targetDateStr = date || new Date().toLocaleDateString('en-CA');

    try {
        // 1. Obtener datos de ventas solo para este cajero
        const where = {
            user_id: userId,
            timestamp: { [Op.between]: [`${targetDateStr} 00:00:00`, `${targetDateStr} 23:59:59`] },
            status: { [Op.not]: 'cancelled' }
        };

        // CORRECCIÓN: Obtener los gastos del día para este cajero.
        const expensesWhere = {
            user_id: userId,
            expense_date: targetDateStr,
            status: 'approved'
        };
        const totalExpenses = await db.Expense.sum('amount', { where: expensesWhere }) || 0;

        // Este total es para el desglose, no afecta el cálculo de caja.
        const totalSales = await db.Order.sum('total', { where }) || 0;
        
        const paymentReport = await db.Order.findAll({
            attributes: ['payment_method', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'transaction_count'], [db.sequelize.fn('SUM', db.sequelize.col('total')), 'total_revenue']],
            where: {
                ...where,
                payment_method: { [Op.ne]: null }
            },
            group: ['payment_method'],
            order: [[db.sequelize.fn('SUM', db.sequelize.col('total')), 'DESC']]
        });

        // 2. Obtener el monto de inicio de caja
        const today = new Date(`${targetDateStr}T00:00:00`);
        const session = await db.CashierSession.findOne({
            where: { user_id: userId, start_time: { [Op.gte]: today } }
        });
        const startAmount = session ? parseFloat(session.start_amount) : 0;

        // 3. Generar PDF (usaremos una versión simplificada de la función de reporte)
        const cashierReportData = { totalSales, paymentReport, startAmount, totalExpenses, targetDateStr };
        generateCashierPdfReport(res, cashierReportData, req.user);

    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en POST /api/reports/cashier-report:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno al generar el reporte.' });
    }
});

// --- Sales Report Route ---
app.get('/api/reports/sales', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { startDate, endDate, customerId } = req.query;
    const { role, id: userId } = req.user;

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Se requieren fechas de inicio y fin.' });
    }

    try {
        const whereClause = {
            // MODIFICACIÓN: Usar el rango del día operativo para consistencia con otros reportes.
            // Esto asegura que las ventas de madrugada se asignen al día correcto.
            timestamp: {
                [Op.between]: [getOperationalDayRange(startDate).start, getOperationalDayRange(endDate).end]
            }
            // MODIFICACIÓN: Eliminamos el filtro de estado aquí para traer todos los pedidos,
            // incluidos los anulados, y manejarlos en el frontend.
            // status: { [Op.in]: ['paid', 'completed'] } 
        };

        if (customerId) {
            whereClause.customer_id = customerId;
        }

        // Si el rol es 'cashier', solo puede ver sus propias ventas.
        if (role === 'cashier') {
            whereClause.user_id = userId;
        }

        const orders = await db.Order.findAll({
            where: whereClause,
            include: [
                {
                    model: db.Customer,
                    as: 'customer',
                    attributes: ['full_name'],
                    required: false // Esto convierte el JOIN en un LEFT JOIN
                },
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['username'],
                    required: false // Esto convierte el JOIN en un LEFT JOIN
                },
                {
                    model: db.OrderItem,
                    as: 'orderItems',
                    attributes: ['quantity'],
                    include: [{ model: db.Product, as: 'product', attributes: ['name'] }]
                }
            ],
            order: [['timestamp', 'DESC']]
        });

        // MODIFICACIÓN: Calculamos el ingreso total solo de los pedidos que NO están anulados.
        const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((sum, order) => sum + parseFloat(order.total), 0);

        res.json({ orders, totalOrders: orders.length, totalRevenue });
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en GET /api/reports/sales:", {
            message: error.message,
            stack: error.stack,
            query: req.query
        });
        res.status(500).json({ message: 'Error interno del servidor al generar reporte de ventas.' });
    }
});

function generateCashierPdfReport(res, data, user) {
    const { totalSales, paymentReport, startAmount, totalExpenses, targetDateStr } = data;
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    const reportDate = new Date(`${targetDateStr}T00:00:00`);
    const formattedDate = reportDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima', year: 'numeric', month: 'long', day: 'numeric' });
    const filename = `Reporte-Caja-${user.username}-${reportDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }).replace(/\//g, '-')}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    // --- Header ---
    doc.fillColor('#444444')
        .fontSize(20).font('Helvetica-Bold').text('Reporte de Caja Personal', { align: 'center' })
        .fontSize(12).font('Helvetica').text(`Cajero: ${user.username} - ${formattedDate}`, { align: 'center' })
        .moveDown(2);

    // --- Summary Section ---
    const totalCash = (paymentReport.find(p => p.get('payment_method') === 'Efectivo')?.get('total_revenue') || 0);
    const totalOtherSales = totalSales - totalCash;
    // MODIFICACIÓN: Restar los gastos del total esperado en caja.
    const expectedInBox = parseFloat(startAmount) + parseFloat(totalCash) - parseFloat(totalExpenses);

    doc.font('Helvetica-Bold').fontSize(14).text('Resumen de Ventas y Caja', { underline: true }).moveDown();
    doc.font('Helvetica').fontSize(11).fillColor('#374151');
    doc.text(`Ventas Totales del Día:`, { continued: true }).font('Helvetica-Bold').text(` S/. ${parseFloat(totalSales).toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica').text(`   - En Efectivo:`, { continued: true }).font('Helvetica-Bold').text(` S/. ${parseFloat(totalCash).toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica').text(`   - Otros Medios:`, { continued: true }).font('Helvetica-Bold').text(` S/. ${parseFloat(totalOtherSales).toFixed(2)}`, { align: 'right' });
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Cálculo de Caja', { underline: true }).moveDown(0.5);
    doc.font('Helvetica').fontSize(11);
    doc.text(`(+) Monto Inicial en Caja:`, { continued: true }).font('Helvetica-Bold').text(` S/. ${parseFloat(startAmount).toFixed(2)}`, { align: 'right' });
    doc.text(`(+) Ventas en Efectivo:`, { continued: true }).font('Helvetica-Bold').text(` S/. ${parseFloat(totalCash).toFixed(2)}`, { align: 'right' });
    doc.text(`(-) Gastos Registrados:`, { continued: true }).font('Helvetica-Bold').text(` S/. ${parseFloat(totalExpenses).toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.5).strokeColor('#374151').lineWidth(0.5).moveTo(doc.x, doc.y).lineTo(555, doc.y).stroke().moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12).text(`(=) Total Esperado en Caja:`, { continued: true }).text(` S/. ${expectedInBox.toFixed(2)}`, { align: 'right' });
    doc.moveDown(2);

    // --- Payment Method Table ---
    doc.font('Helvetica-Bold').fontSize(14).text('Desglose Detallado por Método de Pago', { underline: true }).moveDown();
    const paymentTableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Método de Pago', 50, paymentTableTop);
    doc.text('Nº Trans.', 370, paymentTableTop, { width: 70, align: 'right' });
    doc.text('Total Recaudado', 460, paymentTableTop, { width: 80, align: 'right' });
    doc.moveDown(0.5).strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.font('Helvetica').fontSize(9);
    paymentReport.forEach(item => {
        const rowY = doc.y;
        doc.moveDown(0.5);
        doc.text(item.get('payment_method'), 50, rowY);
        doc.text(item.get('transaction_count').toString(), 370, rowY, { width: 70, align: 'right' });
        doc.text(`S/. ${parseFloat(item.get('total_revenue')).toFixed(2)}`, 460, rowY, { width: 80, align: 'right' });
    });
    doc.moveDown();
    doc.end();
}

// Reopen a closed day (for admins)
app.post('/api/reports/reopen', verifyToken, checkRole(['admin']), async (req, res) => {
    const { date } = req.body;
    const targetDateStr = date || new Date().toLocaleDateString('en-CA');

    try {
        const closure = await db.DailyClosure.findByPk(targetDateStr);
        if (closure && closure.status === 'closed') {
            await closure.update({ status: 'open' });
            res.status(200).json({ message: 'El día ha sido reabierto exitosamente.' });
        } else {
            res.status(400).json({ message: 'El día no está cerrado o no se encontró.' });
        }
    } catch (error) {
        // Logging mejorado
        console.error("Error detallado en POST /api/reports/reopen:", {
            message: error.message,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: 'Error interno al reabrir el día.' });
    }
});

// --- Rutas para Gestión de Productos (Admin) ---

app.get('/api/products', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    try {
        const products = await db.Product.findAll({
            include: [{ model: db.Category, as: 'category' }],
            order: [
                [{ model: db.Category, as: 'category' }, 'display_order', 'ASC'],
                ['name', 'ASC']
            ]
        });
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los productos', error: error.message });
    }
});

app.post('/api/products', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { name, price, category_id, stock, stock_type } = req.body;
    try {
        await db.Product.create({ name, price, category_id, stock, stock_type });
        res.status(201).json({ message: 'Producto creado exitosamente.'});
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({ message: 'Error interno al crear el producto.', error: error.message });
    }
});

app.put('/api/products/:id', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { id } = req.params;
    const productData = req.body;

    // Si el usuario es un cajero, no se le permite modificar el stock.
    // Eliminamos el campo 'stock' del objeto de datos para que no se actualice.
    if (req.user.role === 'cashier') {
        delete productData.stock;
    }

    try {
        const [affectedRows] = await db.Product.update(productData, { where: { id } });
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        res.status(200).json({ message: 'Producto actualizado exitosamente.' });
    } catch (error) {
        console.error('Error al actualizar producto:', error);
        res.status(500).json({ message: 'Error interno al actualizar el producto.', error: error.message });
    }
});

app.delete('/api/products/:id', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
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

app.get('/api/dashboard/ingredient-stock-report', verifyToken, checkRole(['admin', 'cashier', 'kitchen']), async (req, res) => {
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
            { expiresIn: '6h' } // La sesión ahora expira en 6 horas
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

// --- Admin Management: Expenses (CRUD) ---
app.get('/api/expenses', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    try {
        const whereClause = {};
        // Si el usuario es cajero, solo puede ver sus propios gastos.
        if (req.user.role === 'cashier') {
            whereClause.user_id = req.user.id;
        }

        const expenses = await db.Expense.findAll({
            where: whereClause,
            include: [{ model: db.User, as: 'user', attributes: ['username'] }],
            order: [['expense_date', 'DESC']]
        });
        res.json(expenses);
    } catch (error) {
        console.error("Error al obtener los gastos:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.post('/api/expenses', verifyToken, checkRole(['admin', 'cashier']), async (req, res) => {
    const { description, quantity, unit, amount, category, expense_date } = req.body;
    try {
        // MODIFICACIÓN: Los gastos de cajeros y admins se aprueban automáticamente.
        // El admin luego los revisa en el reporte general.
        const status = 'approved';

        await db.Expense.create({
            description,
            quantity,
            unit,
            amount,
            category,
            expense_date,
            status,
            user_id: req.user.id
        });
        res.status(201).json({ message: 'Gasto registrado exitosamente.' });
    } catch (error) {
        console.error("Error al registrar el gasto:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/expenses/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { description, quantity, unit, amount, category, expense_date, status } = req.body;
    try {
        const [affectedRows] = await db.Expense.update(
            { description, quantity, unit, amount, category, expense_date, status },
            { where: { id } }
        );
        if (affectedRows === 0) return res.status(404).json({ message: 'Gasto no encontrado.' });
        res.json({ message: 'Gasto actualizado exitosamente.' });
    } catch (error) {
        console.error("Error al actualizar el gasto:", error);
        res.status(500).send('Error interno del servidor');
    }
});

app.delete('/api/expenses/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const affectedRows = await db.Expense.destroy({ where: { id } });
        if (affectedRows === 0) return res.status(404).json({ message: 'Gasto no encontrado.' });
        res.json({ message: 'Gasto eliminado exitosamente.' });
    } catch (error) {
        console.error("Error al eliminar el gasto:", error);
        res.status(500).send('Error interno del servidor');
    }
});

// --- Admin Management: Users (CRUD) ---
app.get('/api/roles', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const roles = await db.Role.findAll({ order: [['name', 'ASC']] });
        res.json(roles);
    } catch (error) {
        res.status(500).send('Error interno del servidor');
    }
});

app.get('/api/users', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const users = await db.User.findAll({
            include: [{ model: db.Role, as: 'role' }],
            order: [['username', 'ASC']]
        });
        res.json(users);
    } catch (error) {
        res.status(500).send('Error interno del servidor');
    }
});

app.post('/api/users', verifyToken, checkRole(['admin']), async (req, res) => {
    const { username, password, full_name, role_id } = req.body;
    if (!username || !password || !role_id) {
        return res.status(400).json({ message: 'Usuario, contraseña y rol son requeridos.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        await db.User.create({ username, password_hash, full_name, role_id });
        res.status(201).json({ message: 'Usuario creado exitosamente.' });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'El nombre de usuario ya existe.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

app.put('/api/users/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { username, password, full_name, role_id } = req.body;

    try {
        const userData = { username, full_name, role_id };
        if (password) {
            const salt = await bcrypt.genSalt(10);
            userData.password_hash = await bcrypt.hash(password, salt);
        }
        const [affectedRows] = await db.User.update(userData, { where: { id } });
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        res.status(200).json({ message: 'Usuario actualizado.' });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'El nombre de usuario ya existe.' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

app.delete('/api/users/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const affectedRows = await db.User.destroy({ where: { id } });
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        res.status(200).json({ message: 'Usuario eliminado.' });
    } catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({ message: 'No se puede eliminar el usuario porque tiene registros asociados (pedidos, gastos, etc.).' });
        }
        res.status(500).send('Error interno del servidor');
    }
});

// =================================================================
// --- PAGE SERVING ROUTES ---
// =================================================================

// Middleware para servir archivos estáticos (CSS, JS del cliente, imágenes, etc.)
// Debe ir DESPUÉS de las rutas de la API.
app.use(express.static(__dirname));

// Middleware para deshabilitar la caché en todas las rutas de la API
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // No es necesario llamar a next() si esta es la última configuración global para /api
    // pero lo dejamos por si se añaden más middlewares después.
    next();
});

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

app.get('/manage-expenses.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'manage-expenses.html'));
});

app.get('/accounts.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'accounts.html'));
});

app.get('/manage-users.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'manage-users.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/sales-report.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sales-report.html'));
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
            const order = await db.Order.findByPk(orderId);
            if (order) {
                // Si es una cuenta abierta (sin método de pago), pasa a 'serving'.
                // Si fue un pedido pagado, pasa a 'completed'.
                const newStatus = order.payment_method ? 'completed' : 'serving';
                await order.update({ status: newStatus });
                // Notificar a la cocina para que elimine la tarjeta de la vista.
                io.emit('remove_order', orderId);
            }
        } catch (error) {
            console.error(`Error al marcar la orden ${orderId} como lista:`, error);
        }
    });

    // Opcional: Manejar la desconexión
    socket.on('disconnect', () => {
        console.log(`Dispositivo desconectado: ${socket.user.username}`);
    });
});

// En un entorno de producción, NUNCA se debe usar sync().
// La base de datos debe ser gestionada a través de migraciones.
// El servidor simplemente se conecta y asume que la estructura es correcta.
db.sequelize.authenticate()
    .then(() => {
        console.log('Conexión a la base de datos establecida exitosamente.');
        server.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
            console.log(`Login: http://localhost:${PORT}/login.html`);
        });
    })
    .catch(err => {
        console.error('No se pudo conectar a la base de datos:', err);
    });
