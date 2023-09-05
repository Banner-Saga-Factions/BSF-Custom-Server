import { execute } from "../mysql.connector";

import { UsersQueries } from "./users.queries";
import { User, Party, Roster, RosterStat, UpdateRosterStat } from "./users.model";

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
 * gets user's party based on id provided
 */
export const getUserPartyById = async (user_fk: Party['user_fk']) => {
  return execute<Party>(UsersQueries.GetUserPartyById, [user_fk]);
};

/**
 * gets user's party based on id provided
 */
export const getUserRostersById = async (user_fk: Roster['user_fk']) => {
  return execute<Roster>(UsersQueries.GetUserRostersById, [user_fk]);
};

/**
 * Get logged in User's party roster
 */
export const getUserPartyRosters = async (user_fk: Roster['user_fk'])  => {
  return execute<Roster[]>(UsersQueries.GetUserPartyRostersByUserId, [user_fk, user_fk]);
};

/**
 * gets user's party based on id provided
 */
export const getUserRosterStatsByRosterId = async (roster_fk: RosterStat['roster_fk']) => {
  return execute<RosterStat>(UsersQueries.GetUserRosterStatsByRosterId, [roster_fk]);
};

/**
 * gets user's roster unit stat (single stat)
 */
export const getUserRosterStat = async (roster_fk: RosterStat['roster_fk'], stat_fk: number) => {
  return execute<RosterStat>(UsersQueries.GetUserRosterStat, [roster_fk, stat_fk]);
};

/**
 * gets roster unit by user id and unit id
 */
export const getUnitByUserIdAndUnitId = async (user_fk: Roster['user_fk'], unit_id: Roster['unit_id']) => {
  return execute<Roster>(UsersQueries.GetUnitByUserIdAndUnitId, [user_fk, unit_id]);
};

/**
 * insert user's party
 */
export const insertUserParty = async (user_fk: Party['user_fk'], unit_id: Party['unit_id']) => {
  execute<Party>(UsersQueries.InsertUserParty, [user_fk, unit_id]);
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

/**
 * updates roster's RANK stat by 1
 */
export const updateRosterRank = async (roster_fk: RosterStat['roster_fk']) => {
  return execute<RosterStat>(UsersQueries.UpdateRosterStat_Rank, [roster_fk]);
};

/**
 * updates roster's stat by id
 */
export const updateRosterStat = async (value: UpdateRosterStat['value'], roster_fk: UpdateRosterStat['roster_fk'], stat_fk: UpdateRosterStat['stat_fk']) => {
  console.log(value + ' ' + roster_fk + ' ' + stat_fk);
  return execute<UpdateRosterStat>(UsersQueries.UpdateRosterStat, [value, roster_fk, stat_fk]);
};

/**
 * updates roster's name
 */
export const updateUnitName = async (user_fk: Roster['user_fk'], unit_id: Roster['unit_id'], name: Roster['name']) => {
  return execute<RosterStat>(UsersQueries.UpdateRoster_Name, [name, user_fk, unit_id]);
};

/**
 * updates roster's entity class
 */
export const updateUnitClass = async (user_fk: Roster['user_fk'], unit_id: Roster['unit_id'], entity_class: Roster['entity_class']) => {
  return execute<RosterStat>(UsersQueries.UpdateRoster_EntityClass, [entity_class, user_fk, unit_id]);
};

/**
 * Delete user's party
 */
export const deletetUserParty = async (user_fk: Party['user_fk']) => {
  execute<Party>(UsersQueries.DeleteUserParty, [user_fk]);
};

/**
 * Delete user's Roster / Unit stats
 */
export const deleteRosterStats = async (user_fk: Roster['user_fk'], unit_id: Roster['unit_id']) => {
  execute<Roster>(UsersQueries.DeleteUserRosterStats, [user_fk, unit_id]);
};

/**
 * Delete user's Roster / Unit
 */
export const deleteRoster = async (user_fk: Roster['user_fk'], unit_id: Roster['unit_id']) => {
  execute<Roster>(UsersQueries.DeleteUserRosterUnit, [user_fk, unit_id]);
};