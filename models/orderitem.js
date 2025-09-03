'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class OrderItem extends Model {
    static associate(models) {
      OrderItem.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
      OrderItem.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    }
  }
  OrderItem.init({
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    price_at_time: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    sauces: {
      type: DataTypes.TEXT
    }
  }, {
    sequelize,
    modelName: 'OrderItem',
    tableName: 'order_items',
    timestamps: false
  });
  return OrderItem;
};