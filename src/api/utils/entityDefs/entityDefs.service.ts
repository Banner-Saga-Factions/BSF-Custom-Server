import { execute } from "../mysql.connector";

import * as EntityDefQueries from "./entityDefs.queries";
import * as EntityDefModels from "./entityDefs.model";

/**
 * gets user's party based on id provided
 */
export const getUserEntityDefsByUserId = async (user_fk: EntityDefModels.EntityDef['user_fk']) => {
  return execute<EntityDefModels.EntityDef>(EntityDefQueries.EntityDefQueries.GetUserEntityDefsByUserId, [user_fk]);
};

/**
 * Get logged in User's party roster
 */
export const getUserPartyEntityDefs = async (user_fk: EntityDefModels.EntityDef['user_fk'])  => {
  return execute<EntityDefModels.EntityDef[]>(EntityDefQueries.EntityDefQueries.GetUserPartyEntityDefsByUserId, [user_fk, user_fk]);
};

/**
 * gets roster unit by user id and unit id
 */
export const getUnitByUserIdAndUnitId = async (user_fk: EntityDefModels.EntityDef['user_fk'], unit_id: EntityDefModels.EntityDef['unit_id']) => {
  return execute<EntityDefModels.EntityDef>(EntityDefQueries.EntityDefQueries.GetUnitByUserIdAndUnitId, [user_fk, unit_id]);
};

/**
 * Get User's Entity Def max unit_id by unit id
 */
export const getEntityMaxUnitId = async (user_fk: number, unit_id: string): Promise<EntityDefModels.EntityDef> => {
  return execute<EntityDefModels.EntityDef>(EntityDefQueries.EntityDefQueries.GetEntityMaxUnitId, [user_fk, unit_id]);
};

/**
 * gets user's entity def ID based on unit id provided
 */
export const getUserEntDefByUnitId = async (user_fk: number, unit_id: string) => {
  return execute<number>(EntityDefQueries.EntityDefQueries.GetUserEntDefByUnitId, [user_fk, unit_id]);
};

/**
 * Insert Purchasable Unit data to Roster - triggers when hiring new units
 */
export const insertUserEntity = async (new_entity: EntityDefModels.AddEntityDef) => {
  return execute<EntityDefModels.EntityDef>(EntityDefQueries.EntityDefQueries.InsertUserEntity, [new_entity.user_fk, new_entity.unit_id, new_entity.entity_class, new_entity.name, new_entity.appearance_acquires, new_entity.appearance_index]);
};

/**
 * updates roster's name
 */
export const updateUnitName = async (user_fk: EntityDefModels.EntityDef['user_fk'], unit_id: EntityDefModels.EntityDef['unit_id'], name: EntityDefModels.EntityDef['name']) => {
  return execute<EntityDefModels.EntityDef>(EntityDefQueries.EntityDefQueries.UpdateEntity_Name, [name, user_fk, unit_id]);
};

/**
 * updates roster's entity class
 */
export const updateUnitClass = async (user_fk: EntityDefModels.EntityDef['user_fk'], unit_id: EntityDefModels.EntityDef['unit_id'], entity_class: EntityDefModels.EntityDef['entity_class']) => {
  return execute<EntityDefModels.EntityDef>(EntityDefQueries.EntityDefQueries.UpdateEntity_EntityClass, [entity_class, user_fk, unit_id]);
};

/**
 * Delete user's Roster / Unit
 */
export const deleteEntityDef = async (user_fk: EntityDefModels.EntityDef['user_fk'], unit_id: EntityDefModels.EntityDef['unit_id']) => {
  execute<EntityDefModels.EntityDef>(EntityDefQueries.EntityDefQueries.DeleteUserEntityUnit, [user_fk, unit_id]);
};