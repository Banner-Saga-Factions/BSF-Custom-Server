import { execute } from "../mysql.connector";

import * as PartiesQueries from "./parties.queries";
import * as PartiesModels from "./parties.model";

/**
 * gets user's party based on user's id
 */
export const getUserPartyById = async (user_fk: PartiesModels.Party['user_fk']) => {
  return execute<PartiesModels.Party>(PartiesQueries.PartiesQueries.GetUserPartyByUserId, [user_fk]);
};

/**
 * insert user's active party
 */
export const insertUserParty = async (user_fk: PartiesModels.Party['user_fk'], unit_id: PartiesModels.Party['unit_id']) => {
  execute<PartiesModels.Party>(PartiesQueries.PartiesQueries.InsertUserParty, [user_fk, unit_id]);
};

/**
 * Delete user's party
 */
export const deletetUserParty = async (user_fk: PartiesModels.Party['user_fk']) => {
  execute<PartiesModels.Party>(PartiesQueries.PartiesQueries.DeleteUserParty, [user_fk]);
};