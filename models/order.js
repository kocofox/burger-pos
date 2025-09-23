'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Order extends Model {
    static associate(models) {
      Order.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      Order.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
      Order.hasMany(models.OrderItem, { foreignKey: 'order_id', as: 'orderItems' });
      // --- AÑADIR ESTA LÍNEA ---
      Order.hasOne(models.CustomerCredit, { foreignKey: 'order_id', as: 'credit' });
    }
  }
  Order.init({
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true // Permite pedidos sin cliente asociado explícitamente
    },
    customer_name: DataTypes.STRING,
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    notes: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM('serving', 'pending', 'completed', 'paid', 'cancelled'),
      defaultValue: 'pending'
    },
    payment_method: DataTypes.STRING,
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Order',
    tableName: 'orders',
    timestamps: false
  });
  return Order;
};