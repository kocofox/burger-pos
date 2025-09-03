'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('roles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(50), allowNull: false, unique: true }
    });

    await queryInterface.createTable('users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      role_id: { type: Sequelize.INTEGER, references: { model: 'roles', key: 'id' } }
    });

    await queryInterface.createTable('categories', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      is_customizable: { type: Sequelize.BOOLEAN, defaultValue: false },
      display_name: { type: Sequelize.STRING(100) },
      display_order: { type: Sequelize.INTEGER, defaultValue: 99 }
    });

    await queryInterface.createTable('products', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      stock_type: { type: Sequelize.ENUM('SIMPLE', 'COMPOUND'), allowNull: false, defaultValue: 'SIMPLE' },
      stock: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
      category_id: { type: Sequelize.INTEGER, references: { model: 'categories', key: 'id' } }
    });

    await queryInterface.createTable('orders', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customer_name: { type: Sequelize.STRING(255) },
      total: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      notes: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING(50), defaultValue: 'pending' },
      payment_method: { type: Sequelize.STRING(50) },
      user_id: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
      timestamp: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
    });

    await queryInterface.createTable('order_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: Sequelize.INTEGER, references: { model: 'orders', key: 'id' } },
      product_id: { type: Sequelize.INTEGER, references: { model: 'products', key: 'id' } },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      price_at_time: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      sauces: { type: Sequelize.TEXT }
    });

    await queryInterface.createTable('ingredients', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      stock: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }
    });

    await queryInterface.createTable('product_ingredients', {
      product_id: { type: Sequelize.INTEGER, primaryKey: true, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE' },
      ingredient_id: { type: Sequelize.INTEGER, primaryKey: true, references: { model: 'ingredients', key: 'id' }, onDelete: 'CASCADE' },
      quantity_required: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 }
    });

    await queryInterface.createTable('sauces', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true }
    });

    await queryInterface.createTable('payment_methods', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(50), allowNull: false, unique: true }
    });

    await queryInterface.createTable('daily_closures', {
      closure_date: { type: Sequelize.DATEONLY, primaryKey: true },
      status: { type: Sequelize.ENUM('open', 'pending_closure', 'closed'), allowNull: false, defaultValue: 'open' },
      proposed_by_user_id: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
      closed_by_user_id: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
      proposed_at: { type: Sequelize.DATE },
      closed_at: { type: Sequelize.DATE }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('daily_closures');
    await queryInterface.dropTable('payment_methods');
    await queryInterface.dropTable('sauces');
    await queryInterface.dropTable('product_ingredients');
    await queryInterface.dropTable('ingredients');
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
    await queryInterface.dropTable('products');
    await queryInterface.dropTable('categories');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('roles');
  }
};