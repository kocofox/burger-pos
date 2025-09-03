'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DailyClosure extends Model {
    static associate(models) {
      DailyClosure.belongsTo(models.User, { foreignKey: 'proposed_by_user_id', as: 'proposer' });
      DailyClosure.belongsTo(models.User, { foreignKey: 'closed_by_user_id', as: 'closer' });
    }
  }
  DailyClosure.init({
    closure_date: {
      type: DataTypes.DATEONLY,
      primaryKey: true
    },
    status: {
      type: DataTypes.ENUM('open', 'pending_closure', 'closed'),
      allowNull: false,
      defaultValue: 'open'
    },
    proposed_at: DataTypes.DATE,
    closed_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'DailyClosure',
    tableName: 'daily_closures',
    timestamps: false
  });
  return DailyClosure;
};