import { execute } from "../mysql.connector";

import * as StatsQueries from "./stats.queries";
import * as StatsModels from "./stats.model";

/**
 * get stat by name
 */
export const getStatByName = async (stat: string) => {
  return execute<StatsModels.Stat>(StatsQueries.StatsQueries.GetStatByName, [stat]);
};