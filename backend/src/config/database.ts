import { Sequelize } from 'sequelize';
import { env } from './env.js';

export const sequelize = new Sequelize(
  env.database.name,
  env.database.user,
  env.database.password,
  {
    host: env.database.host,
    port: env.database.port,
    dialect: 'mysql',
    logging: env.nodeEnv === 'development' ? console.log : false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
);

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync();
  console.log('MySQL connection established.');
}
