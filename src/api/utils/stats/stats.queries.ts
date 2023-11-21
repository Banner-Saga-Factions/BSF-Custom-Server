export const StatsQueries = {
    GetStatByName: 
    `
    SELECT
      *
    FROM db.Stats
    WHERE stat = ?;
    `,

    GetEntityDefStatsByDefId: `
    SELECT 
      s.entitydef_fk, ss.stat, s.value
    FROM db.Stat as s
    LEFT JOIN db.Stats ss ON s.stats_fk = ss.id
    WHERE
      s.entitydef_fk = ?
    ORDER BY s.stats_fk ASC;
    `,

    GetUserDefStat: `
    SELECT 
      *
    FROM db.Stat
    WHERE 
      entitydef_fk = ?
    AND 
      stats_fk = ?;
    `,

    InsertUserEntityStat: `
    INSERT INTO db.Stat
      (entitydef_fk, stats_fk, value)
    VALUES
      (?, ?, ?);
    `,

    UpdateEntityStat_Rank: 
    `
    UPDATE db.Stat as s
      SET s.value = s.value + 1
    WHERE
      entitydef_fk = ?
    AND 
      stats_fk = 1;
    `,

    UpdateEntityStat: 
    `
    UPDATE db.Stat as s
      SET s.value = s.value + ?
    WHERE
      entitydef_fk = ?
    AND 
      stats_fk = ?;
    `,

    DeleteUserEntityStats: 
    `
    DELETE FROM db.Stat
    WHERE entitydef_fk = (SELECT id FROM db.EntityDef WHERE user_fk = ? AND unit_id = ?)
    `
  };