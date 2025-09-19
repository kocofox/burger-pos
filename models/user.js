'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
      User.hasMany(models.Order, { foreignKey: 'user_id', as: 'orders' });
      User.hasMany(models.CashierSession, { foreignKey: 'user_id', as: 'cashier_sessions' });
      User.hasMany(models.Expense, { foreignKey: 'user_id', as: 'expenses' });
    }
  }
  User.init({
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    full_name: {
      type: DataTypes.STRING
    },
    phone_number: {
      type: DataTypes.STRING
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles', // Nombre de la tabla de roles
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: false
  });
  return User;
};