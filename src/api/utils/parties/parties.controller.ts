import * as PartiesModel from './parties.model';
import * as PartiesServices from './parties.service';

/**
 * Get User's active party by user ID
 */
export const getUserParty = async (user_fk: number) : Promise<PartiesModel.Party> => {
  return await PartiesServices.getUserPartyById(user_fk);
};

/**
 * Insert User's Party - triggers when sorting party roster
 */
export const insertUserParty = async (user_fk: PartiesModel.Party['user_fk'], unit_id: PartiesModel.Party['unit_id']) => {
  await PartiesServices.insertUserParty(user_fk, unit_id);
};

/**
 * Delete user's party - triggers when sorting party roster
 */
export const deletetUserParty = async (user_fk: PartiesModel.Party['user_fk']) => {
  await PartiesServices.deletetUserParty(user_fk);
};
