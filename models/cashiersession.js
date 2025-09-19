'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CashierSession extends Model {
    static associate(models) {
      this.belongsTo(models.User, { as: 'user', foreignKey: 'user_id' });
    }
  }
  CashierSession.init({
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    start_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    start_time: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'CashierSession',
    timestamps: false, // No necesitamos createdAt/updatedAt
    tableName: 'cashier_sessions'
  });
  return CashierSession;
};