export const PurchasableUnitsQueries = {
    GetPurchasableUnits: 
    `
    SELECT 
      *
    FROM db.PurchasableUnitData
    `,

    GetPurchasableUnitByDefId: 
    `
    SELECT 
      *
    FROM db.PurchasableUnitData as pu
    WHERE entitydef_fk = ?
    `,

    GetRosterMaxUnitId: 
    `
    SELECT 
    *
    FROM db.EntityDef
    WHERE user_fk = ?
    AND unit_id LIKE ?
    ORDER BY unit_id DESC LIMIT 1;
    `,
  };