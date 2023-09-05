export const PurchasableUnitsQueries = {
    GetPurchasableUnits: `
    SELECT 
      pu.id, c1.class as pu_class, c2.class as def_class, def_id, def_entity_class, def_auto_level, def_start_date, def_appearance_acquires, def_appearance_index, pu.limit, cost, comment
    FROM banner_saga_factions.purchasable_units as pu
    LEFT JOIN banner_saga_factions.classes c1 ON pu.class_fk = c1.id
    LEFT JOIN banner_saga_factions.classes c2 ON pu.def_class_fk = c2.id;
    `,

    GetPurchasableUnitByDefId: `
    SELECT 
      *
    FROM banner_saga_factions.purchasable_units as pu
    WHERE def_id = ?
    `,

    GetRosterMaxUnitId: `
    SELECT 
    *
    FROM banner_saga_factions.rosters
    WHERE user_fk = ?
    AND unit_id LIKE ?
    ORDER BY unit_id DESC LIMIT 1;
    `,

    GetUserRosterByUnitId: `
    SELECT 
    id
    FROM banner_saga_factions.rosters
    WHERE user_fk = ?
    AND unit_id = ?;
    `,

    GetPurchasableUnitStatsById: `
    SELECT 
      c.class, s.stat, value
    FROM banner_saga_factions.purchasable_unit_stats as pus
    LEFT JOIN banner_saga_factions.classes c ON pus.class_fk = c.id
    LEFT JOIN banner_saga_factions.stats s ON pus.stat_fk = s.id
    WHERE
      pus.purchasable_unit_fk = ?
    ORDER BY stat_fk ASC;
    `,

    GetPurchasableUnitStatsRawById: `
    SELECT 
      *
    FROM banner_saga_factions.purchasable_unit_stats
    WHERE
      purchasable_unit_fk = ?
    ORDER BY stat_fk ASC;
    `,

    InsertUserRoster: `
    INSERT INTO banner_saga_factions.rosters
    (user_fk, class_fk, unit_id, entity_class, name, appearance_acquires, appearance_index)
    VALUES
    (?, ?, ?, ?, ?, ?, ?);
    `,

    InsertUserRosterStat: `
    INSERT INTO banner_saga_factions.roster_stats
    (roster_fk, class_fk, stat_fk, value)
    VALUES
    (?, ?, ?, ?);
    `
  };