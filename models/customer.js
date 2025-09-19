// models/customer.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Customer extends Model {
    static associate(models) {
      Customer.hasMany(models.Order, { foreignKey: 'customer_id', as: 'orders' });
    }
  }
  Customer.init({
    full_name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    phone_number: {
      type: DataTypes.STRING,
      unique: true,
      sparse: true // Permite múltiples nulos pero valores únicos si no son nulos
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      sparse: true
    }
  }, {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers', // CORRECCIÓN: Especificar explícitamente el nombre de la tabla
    timestamps: true, // createdAt y updatedAt
  });
  return Customer;
};
