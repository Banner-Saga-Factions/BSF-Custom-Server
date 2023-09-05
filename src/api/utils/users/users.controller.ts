import * as UsersModels from './users.model';
import * as UsersServices from './users.service';

/**
 * Get user record based on id provided
 */
export const getUser = async (user_id: number) => {
    try {
        return await UsersServices.getUserById(user_id);
    } catch (error) {
        return [];
    }
};

/**
 * Get logged in User's party
 */
export const getUserParty = async (user_fk: number) : Promise<UsersModels.Party> => {
    return await UsersServices.getUserPartyById(user_fk);
};

/**
 * Get logged in User's roster
 */
export const getUserRosters = async (user_fk: number) : Promise<UsersModels.Roster> => {
    return await UsersServices.getUserRostersById(user_fk);
};

/**
 * Get logged in User's party roster
 */
export const getUserPartyRosters = async (user_fk: number) : Promise<UsersModels.Roster[]> => {
    return UsersServices.getUserPartyRosters(user_fk);
};

/**
 * Get logged in User's roster's stats
 */
export const getUserRosterStats = async (roster_fk: number) : Promise<UsersModels.RosterStat> => {
    return await UsersServices.getUserRosterStatsByRosterId(roster_fk);
};

/**
 * gets user's roster unit stat (single stat)
 */
export const getUserRosterStat = async (roster_fk: UsersModels.RosterStat['roster_fk'], stat_fk: number) => {
    return await UsersServices.getUserRosterStat(roster_fk, stat_fk);
};

/**
 * gets roster unit by user id and unit id
 */
export const getUnitByUserIdAndUnitId = async (user_fk: UsersModels.Roster['user_fk'], unit_id: UsersModels.Roster['unit_id']) => {
    return await UsersServices.getUnitByUserIdAndUnitId(user_fk, unit_id);
};

/**
 * Insert User's Party - triggers when sorting party roster
 */
export const insertUserParty = async (user_fk: UsersModels.Party['user_fk'], unit_id: UsersModels.Party['unit_id']) => {
    await UsersServices.insertUserParty(user_fk, unit_id);
};

  /**
 * Update user login count - triggers on successful login
 */
export const updateUserLoginCount = async (user_id: number) => {
    await UsersServices.updateUserLoginCount(user_id);
};

/**
 * updates user's renown
 */
export const updateUsersRenown = async (renown: UsersModels.User['renown'], id: UsersModels.User['id']) => {
    await UsersServices.updateUsersRenown(renown, id);
};

/**
 * updates roster's RANK stat by 1
 */
export const updateRosterRank = async (roster_fk: UsersModels.RosterStat['roster_fk']) => {
    return await UsersServices.updateRosterRank(roster_fk);
};

/**
 * updates roster's stat by id
 */
export const updateRosterStat = async (value: number, roster_fk: number, stat_fk: number) => {
    return await UsersServices.updateRosterStat(value, roster_fk, stat_fk);
};

/**
 * updates roster's name
 */
export const updateUnitName = async (user_fk: UsersModels.Roster['user_fk'], unit_id: UsersModels.Roster['unit_id'], name: UsersModels.Roster['name']) => {
    return await UsersServices.updateUnitName(user_fk, unit_id, name);
};

/**
 * updates roster's entity class
 */
export const updateUnitClass = async (user_fk: UsersModels.Roster['user_fk'], unit_id: UsersModels.Roster['unit_id'], entity_class: UsersModels.Roster['entity_class']) => {
    return await UsersServices.updateUnitClass(user_fk, unit_id, entity_class);
  };

/**
 * updates user's roster_rows and renown - triggers when expanding barracks
 */
export const expandUserBarracks = async (id: UsersModels.User['id']) => {
    await UsersServices.expandUserBarracks(id);
};
  
/**
 * Delete user's party - triggers when sorting party roster
 */
export const deletetUserParty = async (user_fk: UsersModels.Party['user_fk']) => {
    await UsersServices.deletetUserParty(user_fk);
};

/**
 * Delete user's Roster / Unit stats
 */
export const deleteRosterStats = async (user_fk: UsersModels.Roster['user_fk'], unit_id: UsersModels.Roster['unit_id']) => {
    await UsersServices.deleteRosterStats(user_fk, unit_id);
};

/**
 * Delete user's Roster / Unit
 */
export const deleteRoster = async (user_fk: UsersModels.Roster['user_fk'], unit_id: UsersModels.Roster['unit_id']) => {
    await UsersServices.deleteRoster(user_fk, unit_id);
};
