export const EntityDefQueries = {
  GetUserEntityDefsByUserId: 
  `
  SELECT 
    id, 
    unit_id, 
    entity_class, 
    name, 
    start_date, 
    appearance_acquires, 
    appearance_index
  FROM db.EntityDef
  WHERE
    user_fk = ?;
  `,

  GetUserPartyEntityDefsByUserId: 
  `
  SELECT 
    ed.id,
    ed.unit_id,
    ed.entity_class,
    ed.name,
    ed.appearance_acquires,
    ed.appearance_index
  FROM db.Parties p
  LEFT JOIN db.EntityDef ed ON p.unit_id = ed.unit_id
  WHERE p.user_fk = ? AND r.user_fk = ?;
  `,

  GetUnitByUserIdAndUnitId: 
  `
  SELECT 
    *
  FROM db.EntityDef as ed
  WHERE
    ed.user_fk = ? and ed.unit_id = ?;
  `,

  GetEntityMaxUnitId: 
  `
  SELECT 
    *
  FROM db.EntityDef
  WHERE 
    user_fk = ?
  AND 
    unit_id LIKE ?
  ORDER BY unit_id DESC LIMIT 1;
  `,

  GetUserEntDefByUnitId: 
  `
  SELECT 
    id
  FROM db.EntityDef
  WHERE user_fk = ?
  AND unit_id = ?;
  `,

  InsertUserEntity: 
  `
  INSERT INTO db.EntityDef
    (user_fk, unit_id, entity_class, name, appearance_acquires, appearance_index)
  VALUES
    (?, ?, ?, ?, ?, ?);
  `,

  UpdateEntity_Name: 
  `
  UPDATE db.EntityDef as ed
    SET ed.name = ?
  WHERE
    user_fk = ?
  AND 
    unit_id = ?;
  `,

  UpdateEntity_EntityClass: 
  `
  UPDATE db.EntityDef as ed
    SET ed.entity_class = ?
  WHERE
    user_fk = ?
  AND 
    unit_id = ?;
  `,

  DeleteUserEntityUnit: 
  `
  DELETE FROM db.EntityDef
  WHERE
    user_fk = ? 
  AND 
    unit_id = ?
  `,
};