import { createPool, Pool} from 'mysql';
import mysql, { Connection, MysqlError } from 'mysql';
import { DATA_SOURCES } from '../../config/vars.config';
const dataSource = DATA_SOURCES.mySqlDataSource;

//let pool: Pool;
let connection: Connection;
/**
 * generates pool connection to be used throughout the app
 */
export const init = () => {
  try {
    /*console.log(dataSource.DB_DATABASE);
    connection = mysql.createConnection({
      host: dataSource.DB_HOST,
      user: dataSource.DB_USER,
      password: dataSource.DB_PASSWORD,
      database: dataSource.DB_DATABASE
    });*/
    //console.log(connection);
    connection = mysql.createConnection({
      port     : 3300,
      host     : '127.0.0.1',
      user     : 'factions',
      password : '4Z7&R!wyCyRs',
      database : 'factions-dev'
    });

    console.debug('MySql Adapter Pool generated successfully');
  } catch (error) {
    console.error('[mysql.connector][init][Error]: ', error);
    throw new Error('failed to initialized pool');
  }
};

/**
 * executes SQL queries in MySQL db 
 * 
 * @param {string} query - provide a valid SQL query
 * @param {string[] | Object} params - provide the parameterized values used
 * in the query 
 */
export const execute = <T>(query: string, params: string[] | Object): Promise<T> => {
  try {
    if (!connection) throw new Error('Pool was not created. Ensure pool is created when running the app.');

    return new Promise<T>((resolve, reject) => {
      let db: any = '`' + connection.config.database + '`';
      query = query.replace(/db/gi, db);

      connection.query(query, params, (error, results) => {
        if (error) reject(error);
        else resolve(results);
      });
    });

  } catch (error) {
    console.error('[mysql.connector][execute][Error]: ', error);
    throw new Error('failed to execute MySQL query');
  }
}