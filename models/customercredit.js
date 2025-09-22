'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CustomerCredit extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
      this.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    }
  }
  CustomerCredit.init({
    customer_id: DataTypes.INTEGER,
    order_id: DataTypes.INTEGER,
    amount: DataTypes.DECIMAL,
    status: DataTypes.STRING,
    paid_at: DataTypes.DATE,
    payment_method: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'CustomerCredit', // El nombre del modelo en singular
    tableName: 'customer_credits' // El nombre de la tabla en plural
  });
  return CustomerCredit;
};