import { execute } from "../mysql.connector";

import { UsersQueries } from "./users.queries";
import { User } from "./users.model";

/**
 * gets all users
 */
export const getUsers = async () => {
  return execute<User[]>(UsersQueries.GetUsers, []);
};

/**
 * gets user based on id provided
 */
export const getUserById = async (id: User['id']) => {
  return execute<User>(UsersQueries.GetUserById, [id]);
};

/**
 * updates user's login count by 1
 */
export const updateUserLoginCount = async (id: User['id']) => {
  return execute<User>(UsersQueries.UpdateUserLoginCount, [id]);
};

/**
 * updates user's roster_rows and renown
 */
export const expandUserBarracks = async (id: User['id']) => {
  return execute<User>(UsersQueries.ExpandUserBarracks, [id]);
};

/**
 * updates user's renown
 */
export const updateUsersRenown = async (renown: User['renown'], id: User['id']) => {
  return execute<User>(UsersQueries.UpdateUserRenown, [renown, id]);
};