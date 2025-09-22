'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Expense extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Expense.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }
  Expense.init({
    description: {
      type: DataTypes.STRING,
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    unit: DataTypes.STRING,
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    category: DataTypes.STRING,
    status: {
      type: DataTypes.ENUM('pending_approval', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending_approval'
    },
    expense_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true // O false si siempre debe haber un usuario
    },
    // NUEVOS CAMPOS AÑADIDOS
    payment_status: {
      type: DataTypes.ENUM('paid', 'unpaid'),
      allowNull: false,
      defaultValue: 'paid'
    },
    payment_method: DataTypes.STRING,
    supplier: DataTypes.STRING,
    voucher_ref: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Expense',
    tableName: 'expenses'
  });
  return Expense;
};