require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const menu = require('./menu.json');

const { DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE, DB_PORT } = process.env;

async function setupDatabase() {
    let connection;
    try {
        // Conexión sin especificar la base de datos para poder crearla
        connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            port: DB_PORT || 3306,
        });

        // Crear la base de datos si no existe
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\`;`);
        console.log(`Base de datos '${DB_DATABASE}' asegurada.`);
        await connection.end();

        // Reconectar, pero ahora a la base de datos específica
        connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            port: DB_PORT || 3306,
            database: DB_DATABASE,
            multipleStatements: true // Permitir múltiples sentencias SQL
        });

        console.log('Conectado a la base de datos. Creando tablas...');

        // --- Limpiar Tablas (Truncate) ---
        // Ya no se eliminan las tablas. Las migraciones se encargan de la estructura.
        // Este script ahora solo se encarga de poblar con datos (seeding).
        const truncateStatements = `
            SET FOREIGN_KEY_CHECKS = 0;
            TRUNCATE TABLE order_items;
            TRUNCATE TABLE orders;
            TRUNCATE TABLE product_ingredients;
            TRUNCATE TABLE products;
            TRUNCATE TABLE categories;
            TRUNCATE TABLE ingredients;
            TRUNCATE TABLE daily_closures;
            TRUNCATE TABLE users;
            TRUNCATE TABLE roles;
            TRUNCATE TABLE sauces;
            TRUNCATE TABLE payment_methods;
            SET FOREIGN_KEY_CHECKS = 1;
        `;
        await connection.query(truncateStatements);
        console.log('Tablas limpiadas para el sembrado (seeding).');

        // --- Cargar Datos Iniciales (Seeding) ---
        console.log('Cargando datos iniciales...');

        // Cargar Roles
        await connection.query(`INSERT INTO roles (name) VALUES ('admin'), ('kitchen'), ('cashier');`);
        console.log('Roles cargados.');

        // Cargar Usuario Admin
        const adminPassword = 'admin'; // Cambia esto en un entorno real
        const salt = await bcrypt.genSalt(10);
        const adminPasswordHash = await bcrypt.hash(adminPassword, salt);
        await connection.query(`
            INSERT INTO users (username, password_hash, role_id) 
            VALUES ('admin', ?, (SELECT id FROM roles WHERE name = 'admin'));
        `, [adminPasswordHash]);
        console.log(`Usuario 'admin' creado con contraseña '${adminPassword}'.`);

        // Cargar Usuario Cajero
        const cashierPassword = 'cajero123';
        const cashierPasswordHash = await bcrypt.hash(cashierPassword, salt);
        await connection.query(`
            INSERT INTO users (username, password_hash, role_id) 
            VALUES ('cajero', ?, (SELECT id FROM roles WHERE name = 'cashier'));
        `, [cashierPasswordHash]);
        console.log(`Usuario 'cajero' creado con contraseña '${cashierPassword}'.`);

        // Cargar Usuario Cocina
        const kitchenPassword = 'cocina123';
        const kitchenPasswordHash = await bcrypt.hash(kitchenPassword, salt);
        await connection.query(`
            INSERT INTO users (username, password_hash, role_id) 
            VALUES ('cocina', ?, (SELECT id FROM roles WHERE name = 'kitchen'));
        `, [kitchenPasswordHash]);
        console.log(`Usuario 'cocina' creado con contraseña '${kitchenPassword}'.`);

        // Cargar Insumos Iniciales
        const initialIngredients = [
            ['Pan', 100],
            ['Carne', 100],
            ['Queso', 100],
            ['Tocino', 50],
            ['Papas', 200],
            ['Chorizo', 100]
        ];
        await connection.query('INSERT INTO ingredients (name, stock) VALUES ?', [initialIngredients]);
        console.log('Insumos iniciales cargados.');

        // Cargar Categorías y Productos del menu.json
        const categoryDisplayNames = {
            'burgers': 'Burgers',
            'hotdogs': 'Hot Dogs',
            'salchipapas': 'Salchipapas',
            'combos': 'Combos',
            'extras': 'Extras',
            'drinks': 'Bebidas',
            'candies': 'Golosinas'
        };
        const categoryOrder = ['burgers', 'hotdogs', 'salchipapas', 'combos', 'extras', 'drinks', 'candies'];
        let orderIndex = 0;
        for (const categoryName of categoryOrder) {
            if (menu[categoryName]) {
                const isCustomizable = ['burgers', 'hotdogs', 'salchipapas'].includes(categoryName);
                const displayName = categoryDisplayNames[categoryName] || categoryName;
                const [categoryResult] = await connection.query(
                    'INSERT INTO categories (name, display_name, display_order, is_customizable) VALUES (?, ?, ?, ?)', [categoryName, displayName, orderIndex++, isCustomizable]
                );
                const categoryId = categoryResult.insertId;

                const isCompound = ['burgers', 'hotdogs', 'salchipapas'].includes(categoryName);
                const stockType = isCompound ? 'COMPOUND' : 'SIMPLE';

                for (const product of menu[categoryName]) {
                    const [productResult] = await connection.query(
                        'INSERT INTO products (name, price, category_id, stock_type, stock) VALUES (?, ?, ?, ?, ?)',
                        [product.name, product.price, categoryId, stockType, 100]
                    );
                    const productId = productResult.insertId;

                    // Si es un producto compuesto, le asignamos una receta de ejemplo
                    if (isCompound) {
                        // Esta es una receta genérica de ejemplo. En un sistema real, cada producto tendría su propia receta.
                        await connection.query(`
                            INSERT INTO product_ingredients (product_id, ingredient_id, quantity_required)
                            VALUES 
                                (?, (SELECT id FROM ingredients WHERE name = 'Pan'), 1),
                                (?, (SELECT id FROM ingredients WHERE name = 'Carne'), 1)
                            ON DUPLICATE KEY UPDATE product_id=product_id;
                        `, [productId, productId]);
                    }
                }
            }
        }        
        console.log('Menú cargado desde menu.json.');

        // Cargar Cremas
        const initialSauces = ['Mayonesa', 'Ketchup', 'Mostaza', 'Tartara', 'Aceituna', 'Rocoto', 'Ají de la casa'];
        await connection.query('INSERT INTO sauces (name) VALUES ?', [initialSauces.map(name => [name])]);
        console.log('Cremas iniciales cargadas.');

        // Cargar Métodos de Pago
        const initialPaymentMethods = ['Yape', 'Plin', 'Efectivo', 'Crédito'];
        await connection.query('INSERT INTO payment_methods (name) VALUES ?', [initialPaymentMethods.map(name => [name])]);
        console.log('Métodos de pago iniciales cargados.');

        console.log('\n¡Configuración de la base de datos completada!');

    } catch (error) {
        console.error('Error durante la configuración de la base de datos:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Conexión cerrada.');
        }
    }
}

setupDatabase();