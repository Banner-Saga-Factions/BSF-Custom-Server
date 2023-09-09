export const StatsQueries = {
    GetStatByName: `
    SELECT
    *
    FROM banner_saga_factions.stats
    WHERE stat = ?;
    `
  };