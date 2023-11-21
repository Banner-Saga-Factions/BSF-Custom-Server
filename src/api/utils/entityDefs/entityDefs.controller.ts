import * as EntityDefsModel from './entityDefs.model';
import * as EntityDefsServices from './entityDefs.service';

/**
 * Get logged in User's roster
 */
export const getUserEntityDefs = async (user_fk: number) : Promise<EntityDefsModel.EntityDef> => {
  return await EntityDefsServices.getUserEntityDefsByUserId(user_fk);
};

/**
* Get logged in User's party roster
*/
export const getUserPartyEntityDefs = async (user_fk: number) : Promise<EntityDefsModel.EntityDef[]> => {
  return EntityDefsServices.getUserPartyEntityDefs(user_fk);
};

/**
 * gets roster unit by user id and unit id
 */
export const getUnitByUserIdAndUnitId = async (user_fk: EntityDefsModel.EntityDef['user_fk'], unit_id: EntityDefsModel.EntityDef['unit_id']) => {
  return await EntityDefsServices.getUnitByUserIdAndUnitId(user_fk, unit_id);
};

/**
 * Get User's Entities max unit_id by unit id
 */
export const getEntityMaxUnitId = async (user_fk: number, unit_id: string): Promise<EntityDefsModel.EntityDef> => {
  return await EntityDefsServices.getEntityMaxUnitId(user_fk, unit_id);
};

/**
 * gets user's roster ID based on unit id provided
 */
export const getUserEntDefByUnitId = async (user_fk: number, unit_id: string) => {
  return await EntityDefsServices.getUserEntDefByUnitId(user_fk, unit_id);
};

/**
 * Insert Purchasable Unit data to Roster - triggers when hiring new units
 */
export const insertUserEntity = async (new_entity: EntityDefsModel.AddEntityDef) => {
  await EntityDefsServices.insertUserEntity(new_entity);
};

/**
 * updates roster's name
 */
export const updateUnitName = async (user_fk: EntityDefsModel.EntityDef['user_fk'], unit_id: EntityDefsModel.EntityDef['unit_id'], name: EntityDefsModel.EntityDef['name']) => {
  return await EntityDefsServices.updateUnitName(user_fk, unit_id, name);
};

/**
* updates roster's entity class
*/
export const updateUnitClass = async (user_fk: EntityDefsModel.EntityDef['user_fk'], unit_id: EntityDefsModel.EntityDef['unit_id'], entity_class: EntityDefsModel.EntityDef['entity_class']) => {
  return await EntityDefsServices.updateUnitClass(user_fk, unit_id, entity_class);
};

/**
 * Delete user's Roster / Unit
 */
export const deleteEntityDef = async (user_fk: EntityDefsModel.EntityDef['user_fk'], unit_id: EntityDefsModel.EntityDef['unit_id']) => {
  await EntityDefsServices.deleteEntityDef(user_fk, unit_id);
};
