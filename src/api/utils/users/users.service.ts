import { execute } from "../mysql.connector";

import { UsersQueries } from "./users.queries";
import { User } from "./users.model";

/**
 * gets active teams
 */
export const getUsers = async () => {
  return execute<User[]>(UsersQueries.GetUsers, []);
};

/**
 * gets a team based on id provided
 */
export const getUserById = async (id: User['id']) => {
  return execute<User>(UsersQueries.GetUserById, [id]);
};