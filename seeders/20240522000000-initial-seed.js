'use strict';
const bcrypt = require('bcryptjs');
const menu = require('../menu.json');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Cargar Roles
    await queryInterface.bulkInsert('roles', [
      { name: 'admin' },
      { name: 'kitchen' },
      { name: 'cashier' }
    ]);
    console.log('Roles cargados.');

    // Obtener los roles recién creados para usar sus IDs
    const roles = await queryInterface.sequelize.query(
      `SELECT id, name FROM roles;`, { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Cargar Usuarios
    const salt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash('admin', salt);
    const cashierPasswordHash = await bcrypt.hash('cajero123', salt);
    const kitchenPasswordHash = await bcrypt.hash('cocina123', salt);

    await queryInterface.bulkInsert('users', [
      { username: 'admin', password_hash: adminPasswordHash, role_id: roles.find(r => r.name === 'admin').id },
      { username: 'cajero', password_hash: cashierPasswordHash, role_id: roles.find(r => r.name === 'cashier').id },
      { username: 'cocina', password_hash: kitchenPasswordHash, role_id: roles.find(r => r.name === 'kitchen').id }
    ]);
    console.log('Usuarios cargados.');

    // Cargar Insumos
    await queryInterface.bulkInsert('ingredients', [
      { name: 'Pan', stock: 100 },
      { name: 'Carne', stock: 100 },
      { name: 'Queso', stock: 100 },
      { name: 'Tocino', stock: 50 },
      { name: 'Papas', stock: 200 },
      { name: 'Chorizo', stock: 100 }
    ]);
    console.log('Insumos cargados.');

    const ingredients = await queryInterface.sequelize.query(
      `SELECT id, name FROM ingredients;`, { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Cargar Categorías y Productos
    const categoryDisplayNames = {
      'burgers': 'Burgers', 'hotdogs': 'Hot Dogs', 'salchipapas': 'Salchipapas',
      'combos': 'Combos', 'extras': 'Extras', 'drinks': 'Bebidas', 'candies': 'Golosinas'
    };
    const categoryOrder = ['burgers', 'hotdogs', 'salchipapas', 'combos', 'extras', 'drinks', 'candies'];
    let orderIndex = 0;

    for (const categoryName of categoryOrder) {
      if (menu[categoryName]) {
        const isCustomizable = ['burgers', 'hotdogs', 'salchipapas'].includes(categoryName);
        const displayName = categoryDisplayNames[categoryName] || categoryName;
        
        await queryInterface.bulkInsert('categories', [{
          name: categoryName,
          display_name: displayName,
          display_order: orderIndex++,
          is_customizable: isCustomizable
        }]);
        const [category] = await queryInterface.sequelize.query(`SELECT id FROM categories WHERE name = '${categoryName}'`, { type: queryInterface.sequelize.QueryTypes.SELECT });

        const isCompound = ['burgers', 'hotdogs', 'salchipapas'].includes(categoryName);
        const stockType = isCompound ? 'COMPOUND' : 'SIMPLE';

        for (const product of menu[categoryName]) {
          const newProductId = await queryInterface.bulkInsert('products', [{
            name: product.name,
            price: product.price,
            category_id: category.id,
            stock_type: stockType,
            stock: 100
          }], { returning: true });

          if (isCompound) {
            const pan = ingredients.find(i => i.name === 'Pan');
            const carne = ingredients.find(i => i.name === 'Carne');
            await queryInterface.bulkInsert('product_ingredients', [
              { product_id: newProductId, ingredient_id: pan.id, quantity_required: 1 },
              { product_id: newProductId, ingredient_id: carne.id, quantity_required: 1 }
            ]);
          }
        }
      }
    }
    console.log('Menú cargado.');

    // Cargar Cremas
    const initialSauces = ['Mayonesa', 'Ketchup', 'Mostaza', 'Tartara', 'Aceituna', 'Rocoto', 'Ají de la casa'].map(name => ({ name }));
    await queryInterface.bulkInsert('sauces', initialSauces);
    console.log('Cremas cargadas.');

    // Cargar Métodos de Pago
    const initialPaymentMethods = ['Yape', 'Plin', 'Efectivo', 'Crédito'].map(name => ({ name }));
    await queryInterface.bulkInsert('payment_methods', initialPaymentMethods);
    console.log('Métodos de pago cargados.');
  },

  async down (queryInterface, Sequelize) {
    // Vaciar las tablas en orden inverso para evitar problemas de claves foráneas
    await queryInterface.bulkDelete('payment_methods', null, {});
    await queryInterface.bulkDelete('sauces', null, {});
    await queryInterface.bulkDelete('product_ingredients', null, {});
    await queryInterface.bulkDelete('ingredients', null, {});
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('categories', null, {});
    await queryInterface.bulkDelete('users', null, {});
    await queryInterface.bulkDelete('roles', null, {});
  }
};